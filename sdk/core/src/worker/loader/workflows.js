import { EOL } from 'node:os';
import { writeFileInTempDir, findWorkflowsInNodeModules, importComponents, matchFiles } from './tools.js';
import { staticMatchers } from './matchers.js';
import { WORKFLOWS_INDEX_FILENAME, WORKFLOW_CATALOG, WORKFLOW_OPTIONS_FILENAME } from '#consts';
import { createChildLogger } from '#logger';
import { ValidationError } from '#errors';

const log = createChildLogger( 'Workflow Loader' );

/**
 * Creates a temporary index file importing all workflows for Temporal.
 * @param {object[]} workflows
 * @returns {string} Filename
 */
const createWorkflowsEntrypoint = workflows => {
  // default system catalog workflow
  const catalog = { name: WORKFLOW_CATALOG, path: import.meta.resolve( '../catalog_workflow/workflow.js' ) };
  const aliasExports = workflows.flatMap( ( { aliases = [], path } ) =>
    aliases.map( alias => ( { name: alias, path } ) )
  );

  const content = [ ...workflows, ...aliasExports, catalog ]
    .map( ( { name, path } ) => `export { default as ${name} } from '${path}';` ).join( EOL );

  return writeFileInTempDir( content, WORKFLOWS_INDEX_FILENAME );
};

/**
 * @typedef Workflow
 * @property {string} path
 * @property {boolean} external
 * @property {string} name
 * @property {string[]} aliases
 * @property {object} inputSchema
 * @property {object} outputSchema
 */
/**
 * @typedef LoadWorkflowsResult
 * @property {Workflow[]} workflows - Loaded workflows
 * @property {string} entrypoint - Index file loading all workflows
 * @property {string} optionsFile - File exporting options for each workflow and their aliases
 */
/**
 * Scan and find workflow.js files and import them.
 * Look into local and external (node_modules) folders.
 * @param {string} rootDir
 * @returns {LoadWorkflowsResult}
 */
export async function loadWorkflows( rootDir ) {
  const workflowNames = new Set();
  const workflowOptions = new Map();

  const workflows = [];
  const localWorkflows = matchFiles( rootDir, [ staticMatchers.workflowFile ] );
  const externalWorkflows = findWorkflowsInNodeModules( rootDir );
  for await ( const { metadata, path } of importComponents( [ ...localWorkflows, ...externalWorkflows ] ) ) {
    const external = externalWorkflows.some( a => a.path === path );
    if ( staticMatchers.workflowPathHasShared( path ) ) {
      throw new ValidationError( 'Workflow directory can\'t be named "shared"' );
    }
    const { name, aliases, options } = metadata;
    if ( workflowNames.has( name ) ) {
      throw new ValidationError( `Workflow name "${name}" conflicts with another workflow or alias. \
Workflow names and aliases must be unique.` );
    }
    if ( WORKFLOW_CATALOG === name ) {
      throw new ValidationError( `Workflow name "${name}" is reserved for the internal catalog workflow.` );
    }
    workflowNames.add( name );
    workflowOptions.set( name, { disableTrace: options?.disableTrace ?? false } );

    for ( const alias of aliases ?? [] ) {
      if ( workflowNames.has( alias ) ) {
        throw new ValidationError( `Workflow "${name}" alias "${alias}" conflicts with another workflow or alias. \
Workflow names and aliases must be unique.` );
      }
      if ( WORKFLOW_CATALOG === alias ) {
        throw new ValidationError( `Workflow "${name}" alias "${alias}" is reserved for the internal catalog workflow.` );
      }
      workflowNames.add( alias );
      workflowOptions.set( alias, { disableTrace: options?.disableTrace ?? false } );
    }

    log.info( name, { path, aliases, ...( external && { external } ) } );
    workflows.push( { ...metadata, path, external } );
  }

  workflowOptions.set( WORKFLOW_CATALOG, { disableTrace: true } );

  // writes down the static workflow options, currently only disable trace
  const optionsContent = `export default ${JSON.stringify( Object.fromEntries( workflowOptions ), undefined, 2 )};`;
  const optionsFile = writeFileInTempDir( optionsContent, WORKFLOW_OPTIONS_FILENAME );

  return { workflows, entrypoint: createWorkflowsEntrypoint( workflows ), optionsFile };
};
