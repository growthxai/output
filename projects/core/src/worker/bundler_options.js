import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findPackageRoot,
  isPathDescendentFromNodeModules,
  packageExposesWorkflows
} from './loader/tools.js';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const workerDir = __dirname; // projects/core/src/worker
const interfaceDir = join( __dirname, '..', 'interface' );
const packagesWithWorkflowsMap = new Map();

/**
 * Skip loaders for most of `node_modules`, except packages that expose workflows.
 */
const excludeUnlessPackageExposeWorkflows = resource => {
  // internal parts: exclude
  if ( resource.startsWith( workerDir ) || resource.startsWith( interfaceDir ) ) {
    return true;
  }
  // not node_modules/: include
  if ( !isPathDescendentFromNodeModules( resource ) ) {
    return false;
  }

  const rootPath = findPackageRoot( resource );
  if ( !rootPath ) {
    return true;
  }

  if ( !packagesWithWorkflowsMap.has( rootPath ) ) {
    packagesWithWorkflowsMap.set( rootPath, packageExposesWorkflows( join( rootPath, 'package.json' ) ) );
  }

  return !packagesWithWorkflowsMap.get( rootPath );
};

export const webpackConfigHook = config => {
  config.resolve = config.resolve ?? {};
  config.resolve.conditionNames = config.resolve.conditionNames ?? [ 'import', 'module', 'webpack', 'default' ];

  config.module = config.module ?? { };
  config.module.rules = config.module.rules ?? [];

  // Validation loader (runs first)
  config.module.rules.push( {
    test: /\.js$/,
    exclude: excludeUnlessPackageExposeWorkflows,
    enforce: 'pre',
    use: {
      loader: join( __dirname, './webpack_loaders/workflow_validator/index.mjs' )
    }
  } );
  // Use AST-based loader for rewriting steps/workflows
  config.module.rules.push( {
    test: /\.js$/,
    exclude: excludeUnlessPackageExposeWorkflows,
    use: {
      loader: join( __dirname, './webpack_loaders/workflow_rewriter/index.mjs' )
    }
  } );
  return config;
};

/**
 * Keep Webpack module paths stable while giving each compiler its own generated source.
 * A changed temporary path would change Temporal's default build ID on every startup.
 */
export const workflowBundleOptions = ( { entrypoint, workflowOptions, activityOptions } ) => {
  const modulesDir = join( workerDir, 'bundle_modules' );
  const workflowsPath = join( modulesDir, 'entrypoint.js' );
  const sources = {
    [workflowsPath]: entrypoint,
    [join( modulesDir, 'workflow_options.js' )]: `export default ${JSON.stringify( workflowOptions )};`,
    [join( modulesDir, 'activity_options.js' )]: `export default ${JSON.stringify( activityOptions )};`
  };

  return {
    workflowsPath,
    webpackConfigHook: config => {
      const configured = webpackConfigHook( config );
      for ( const [ path, content ] of Object.entries( sources ) ) {
        configured.module.rules.push( {
          resource: resource => resource === path,
          use: [ { loader: join( workerDir, 'webpack_loaders/generated_module.cjs' ), options: { content } } ]
        } );
      }
      return configured;
    }
  };
};
