import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { EOL } from 'node:os';
import { fileURLToPath } from 'url';
import { getTraceDestinations, sendHttpRequest } from '#internal_activities';
import {
  activityMatchersBuilder,
  findSharedActivitiesFromWorkflows,
  findWorkflowsInNodeModules,
  importComponents,
  matchFiles,
  staticMatchers
} from './loader_tools.js';
import {
  ACTIVITY_SEND_HTTP_REQUEST,
  ACTIVITY_OPTIONS_FILENAME,
  SHARED_STEP_PREFIX,
  WORKFLOWS_INDEX_FILENAME,
  WORKFLOW_CATALOG,
  ACTIVITY_GET_TRACE_DESTINATIONS
} from '#consts';
import { createChildLogger } from '#logger';
import { ValidationError } from '#errors';

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
  for ( const { path: workflowPath, name: workflowName, external } of workflows ) {
    const dir = dirname( workflowPath );
    for await ( const { fn, metadata, path } of importComponents( matchFiles( dir, Object.values( activityMatchersBuilder( dir ) ) ) ) ) {
      log.info( 'Component loaded', { type: metadata.type, name: metadata.name, path, workflow: workflowName, ...( external && { external } ) } );
      // Activities loaded from a workflow path will use the workflow name as a namespace, which is unique across the platform, avoiding collision
      const activityKey = generateActivityKey( { namespace: workflowName, activityName: metadata.name } );
      if ( activities[activityKey] ) {
        throw new ValidationError( `Activity "${metadata.name}" in workflow "${workflowName}" conflicts with another \
activity in the same workflow. Activity names must be unique within a workflow.` );
      }
      activities[activityKey] = fn;
      // propagate the custom options set on the step()/evaluator() constructor
      activityOptionsMap[activityKey] = metadata.options?.activityOptions ?? undefined;
    }
  }

  // Load shared activities/evaluators from local and external npm modules
  const localSharedActivities = matchFiles( rootDir, [ staticMatchers.sharedStepsDir, staticMatchers.sharedEvaluatorsDir ] );
  const externalSharedActivities = findSharedActivitiesFromWorkflows( workflows.filter( w => w.external ) );
  for await ( const { fn, metadata, path } of importComponents( [ ...localSharedActivities, ...externalSharedActivities ] ) ) {
    const external = externalSharedActivities.some( a => a.path === path );
    log.info( 'Shared component loaded', { type: metadata.type, name: metadata.name, path, ...( external && { external } ) } );
    // Reuses the same global namespace for shared activities
    const activityKey = generateActivityKey( { namespace: SHARED_STEP_PREFIX, activityName: metadata.name } );
    if ( activities[activityKey] ) {
      throw new ValidationError( `Shared activity "${metadata.name}" conflicts with another shared activity. \
Shared activity names must be unique.` );
    }
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
  const workflowNames = new Set();
  const workflows = [];
  const localWorkflows = matchFiles( rootDir, [ staticMatchers.workflowFile ] );
  const externalWorkflows = findWorkflowsInNodeModules( rootDir );
  for await ( const { metadata, path } of importComponents( [ ...localWorkflows, ...externalWorkflows ] ) ) {
    const external = externalWorkflows.some( a => a.path === path );
    if ( staticMatchers.workflowPathHasShared( path ) ) {
      throw new ValidationError( 'Workflow directory can\'t be named "shared"' );
    }
    const { name, aliases } = metadata;
    if ( workflowNames.has( name ) ) {
      throw new ValidationError( `Workflow name "${name}" conflicts with another workflow or alias. \
Workflow names and aliases must be unique.` );
    }
    if ( WORKFLOW_CATALOG === name ) {
      throw new ValidationError( `Workflow name "${name}" is reserved for the internal catalog workflow.` );
    }
    workflowNames.add( name );
    for ( const alias of aliases ?? [] ) {
      if ( workflowNames.has( alias ) ) {
        throw new ValidationError( `Workflow "${name}" alias "${alias}" conflicts with another workflow or alias. \
Workflow names and aliases must be unique.` );
      }
      if ( WORKFLOW_CATALOG === alias ) {
        throw new ValidationError( `Workflow "${name}" alias "${alias}" is reserved for the internal catalog workflow.` );
      }
      workflowNames.add( alias );
    }

    log.info( 'Workflow loaded', { name, path, aliases, ...( external && { external } ) } );
    workflows.push( { ...metadata, path, external } );
  }
  return workflows;
};

/**
 * Loads the hook files from package.json's "@outputai/config" section.
 *
 * @param {string} rootDir
 * @returns {void}
 */
export async function loadHooks( rootDir ) {
  const packageFile = join( rootDir, 'package.json' );
  if ( existsSync( packageFile ) ) {
    const pkg = await import( packageFile, { with: { type: 'json' } } );
    const content = pkg.default;
    const hooks = [];
    // @DEPRECATED: "output" is the legacy namespace for configs, can be removed after couple version (this is being added in 0.3.x)
    hooks.push( ...( content.output?.hookFiles ?? [] ) );
    hooks.push( ...( content['@outputai/config']?.hookFiles ?? [] ) );
    for ( const path of hooks ) {
      const hookFile = join( rootDir, path );
      await import( hookFile );
      log.info( 'Hook file loaded', { path } );
    }
  }
};

/**
 * Creates a temporary index file importing all workflows for Temporal.
 *
 * @param {object[]} workflows
 * @returns
 */
export function createWorkflowsEntryPoint( workflows ) {
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
