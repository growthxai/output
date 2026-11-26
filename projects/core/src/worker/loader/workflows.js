import { EOL } from 'node:os';
import { findWorkflowsInNodeModules, importComponents, matchFiles } from './tools.js';
import { staticMatchers } from './matchers.js';
import { WORKFLOW_CATALOG } from '#consts';
import { createChildLogger } from '#logger';
import { ValidationError } from '#errors';

const log = createChildLogger( 'Workflow Loader' );

/**
 * Generates an index importing all workflows for Temporal.
 * @param {object[]} workflows
 * @returns {string} Entrypoint JavaScript.
 */
const createWorkflowsEntrypoint = workflows => {
  // default system catalog workflow
  const catalog = { name: WORKFLOW_CATALOG, path: import.meta.resolve( '../catalog_workflow/workflow.js' ) };
  const aliasExports = workflows.flatMap( ( { aliases = [], path } ) =>
    aliases.map( alias => ( { name: alias, path } ) )
  );

  // A static re-export makes every cached workflow evaluate the whole catalog: Temporal's reusable VM
  // keeps each module loaded during an activation in that workflow's own cache. A lazy export loads
  // only the invoked workflow; eager mode keeps it in the same bundle. Workflow type resolution is by
  // export name, and the metadata the framework reads is read in Node, never from the bundle.
  const lazyExports = [ ...workflows, ...aliasExports ].map( ( { name, path } ) => `\
async function _${name}( ...args ) {
  const { default: workflow } = await import( /* webpackMode: "eager" */ '${path}' );
  if ( typeof workflow !== 'function' ) {
    throw new TypeError( 'Workflow "${name}" must be exported as default.' );
  }
  return workflow( ...args );
}
export { _${name} as ${name} };` );

  // The catalog stays static: it is the framework's own workflow, small, and always loaded.
  return [ ...lazyExports, `export { default as ${catalog.name} } from '${catalog.path}';` ].join( EOL );
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
 * @property {string} entrypoint - Entrypoint JavaScript loading all workflows
 * @property {Record<string, object>} workflowOptions - Options for workflows and aliases
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

  return { workflows, entrypoint: createWorkflowsEntrypoint( workflows ), workflowOptions: Object.fromEntries( workflowOptions ) };
};
