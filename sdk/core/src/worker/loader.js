import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { EOL } from 'node:os';
import { fileURLToPath } from 'url';
import { getTraceDestinations, sendHttpRequest } from '#internal_activities';
import { importComponents, staticMatchers, activityMatchersBuilder } from './loader_tools.js';
import {
  ACTIVITY_SEND_HTTP_REQUEST,
  ACTIVITY_OPTIONS_FILENAME,
  SHARED_STEP_PREFIX,
  WORKFLOWS_INDEX_FILENAME,
  WORKFLOW_CATALOG,
  ACTIVITY_GET_TRACE_DESTINATIONS
} from '#consts';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Scanner' );

const __dirname = dirname( fileURLToPath( import.meta.url ) );

/**
 * Writes to file the activity options
 *
 * @param {object} optionsMap
 */
const writeActivityOptionsFile = map => {
  const path = join( __dirname, 'temp', ACTIVITY_OPTIONS_FILENAME );
  mkdirSync( dirname( path ), { recursive: true } );
  writeFileSync( path, `export default ${JSON.stringify( map, undefined, 2 )};`, 'utf-8' );
};

/**
 * Creates the activity key that will identify it on Temporal.
 *
 * It composes it using a namespace and the name of the activity.
 *
 * No two activities with the same name can exist on the same namespace.
 *
 * @param {object} options
 * @param {string} namespace
 * @param {string} activityName
 * @returns {string} key
 */
const generateActivityKey = ( { namespace, activityName } ) => `${namespace}#${activityName}`;

/**
 * Load activities:
 *
 * - Scans activities based on workflows, using each workflow folder as a point to lookup for steps, evaluators files;
 * - Scans shared activities in the rootDir;
 * - Loads internal activities as well;
 *
 * Builds a map of activities, where they is generated according to the type of activity and the value is the function itself and return it.
 * - Shared activity keys have a common prefix followed by the activity name;
 * - Internal activities are registered with a fixed key;
 * - Workflow activities keys are composed using the workflow name and the activity name;
 *
 * @param {string} rootDir
 * @param {object[]} workflows
 * @returns {object}
 */
export async function loadActivities( rootDir, workflows ) {
  const activities = {};
  const activityOptionsMap = {};

  // Load workflow based activities
  for ( const { path: workflowPath, name: workflowName } of workflows ) {
    const dir = dirname( workflowPath );
    for await ( const { fn, metadata, path } of importComponents( dir, Object.values( activityMatchersBuilder( dir ) ) ) ) {
      log.info( 'Component loaded', { type: metadata.type, name: metadata.name, path, workflow: workflowName } );
      // Activities loaded from a workflow path will use the workflow name as a namespace, which is unique across the platform, avoiding collision
      const activityKey = generateActivityKey( { namespace: workflowName, activityName: metadata.name } );
      activities[activityKey] = fn;
      // propagate the custom options set on the step()/evaluator() constructor
      activityOptionsMap[activityKey] = metadata.options?.activityOptions ?? undefined;
    }
  }

  // Load shared activities/evaluators
  for await ( const { fn, metadata, path } of importComponents( rootDir, [ staticMatchers.sharedStepsDir, staticMatchers.sharedEvaluatorsDir ] ) ) {
    log.info( 'Shared component loaded', { type: metadata.type, name: metadata.name, path } );
    // The namespace for shared activities is fixed
    const activityKey = generateActivityKey( { namespace: SHARED_STEP_PREFIX, activityName: metadata.name } );
    activities[activityKey] = fn;
    activityOptionsMap[activityKey] = metadata.options?.activityOptions ?? undefined;
  }

  // writes down the activity option overrides
  writeActivityOptionsFile( activityOptionsMap );

  // system activities
  activities[ACTIVITY_SEND_HTTP_REQUEST] = sendHttpRequest;
  activities[ACTIVITY_GET_TRACE_DESTINATIONS] = getTraceDestinations;
  return activities;
};

/**
 * Scan and find workflow.js files and import them.
 *
 * Creates an array containing their metadata and path and return it.
 *
 * @param {string} rootDir
 * @returns {object[]}
 */
export async function loadWorkflows( rootDir ) {
  const workflows = [];
  for await ( const { metadata, path } of importComponents( rootDir, [ staticMatchers.workflowFile ] ) ) {
    if ( staticMatchers.workflowPathHasShared( path ) ) {
      throw new Error( 'Workflow directory can\'t be named "shared"' );
    }
    log.info( 'Workflow loaded', { name: metadata.name, path } );
    workflows.push( { ...metadata, path } );
  }
  return workflows;
};

/**
 * Loads the hook files from package.json's output config section.
 *
 * @param {string} rootDir
 * @returns {void}
 */
export async function loadHooks( rootDir ) {
  const packageFile = join( rootDir, 'package.json' );
  if ( existsSync( packageFile ) ) {
    const pkg = await import( packageFile, { with: { type: 'json' } } );
    for ( const path of pkg.default.output?.hookFiles ?? [] ) {
      const hookFile = join( rootDir, path );
      await import( hookFile );
      log.info( 'Hook file loaded', { path } );
    }
  }
};

/**
 * Validates that all workflow names and aliases are unique across the project.
 *
 * @param {object[]} workflows
 * @throws {Error} If any alias conflicts with a workflow name or another alias
 */
function validateWorkflowNames( workflows ) {
  const allNames = new Map();

  // Register primary names (case-insensitive to prevent confusing collisions)
  for ( const { name } of workflows ) {
    allNames.set( name.toLowerCase(), `workflow "${name}"` );
  }

  // Check the reserved catalog name
  allNames.set( WORKFLOW_CATALOG.toLowerCase(), 'system workflow "$catalog"' );

  // Check aliases against all names
  for ( const { name, aliases = [] } of workflows ) {
    const lowerCaseName = name.toLowerCase();
    for ( const alias of aliases ) {
      const lowerAliasName = alias.toLowerCase();
      if ( lowerAliasName === lowerCaseName ) {
        throw new Error( `Workflow "${name}" has an alias identical to its own name` );
      }
      const conflict = allNames.get( lowerAliasName );
      if ( conflict ) {
        throw new Error( `Alias "${alias}" on workflow "${name}" conflicts with ${conflict}` );
      }
      allNames.set( lowerAliasName, `alias "${alias}" on workflow "${name}"` );
    }
  }
}

/**
 * Creates a temporary index file importing all workflows for Temporal.
 *
 * @param {object[]} workflows
 * @returns
 */
export function createWorkflowsEntryPoint( workflows ) {
  validateWorkflowNames( workflows );

  const path = join( __dirname, 'temp', WORKFLOWS_INDEX_FILENAME );

  // default system catalog workflow
  const catalog = { name: WORKFLOW_CATALOG, path: join( __dirname, './catalog_workflow/workflow.js' ) };
  const aliasExports = workflows.flatMap( ( { aliases = [], path } ) =>
    aliases.map( alias => ( { name: alias, path } ) )
  );
  const content = [ ...workflows, ...aliasExports, catalog ].map( ( { name, path } ) => `export { default as ${name} } from '${path}';` ).join( EOL );

  mkdirSync( dirname( path ), { recursive: true } );
  writeFileSync( path, content, 'utf-8' );
  return path;
};
