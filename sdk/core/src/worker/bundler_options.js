import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExternalWorkflowPackagePath } from './webpack_loaders/tools.js';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const workerDir = __dirname; // sdk/core/src/worker
const interfaceDir = join( __dirname, '..', 'interface' );

/** Skip loaders for most of node_modules; allow known external workflow packages (see tools.js list). */
const excludeUnlessExternalWorkflowPackages = resource => {
  if ( resource.startsWith( workerDir ) || resource.startsWith( interfaceDir ) ) {
    return true;
  }
  const inNodeModules = /[/\\]node_modules[/\\]/.test( resource );
  if ( !inNodeModules ) {
    return false;
  }
  return !isExternalWorkflowPackagePath( resource );
};

export const webpackConfigHook = config => {
  // Prefer the "output-workflow-bundle" export condition when resolving packages.
  // Packages that transitively depend on Node.js built-ins (which can't exist in the
  // Temporal workflow bundle) can provide an alternative entry point under this condition
  // that excludes the offending code paths. Packages without this condition fall through
  // to the standard "import" / "module" / "default" conditions as normal.
  config.resolve = config.resolve ?? {};
  config.resolve.conditionNames = [
    'output-workflow-bundle',
    ...( config.resolve.conditionNames ?? [ 'import', 'module', 'webpack', 'default' ] )
  ];

  config.module = config.module ?? { };
  config.module.rules = config.module.rules ?? [];

  // Validation loader (runs first)
  config.module.rules.push( {
    test: /\.js$/,
    exclude: excludeUnlessExternalWorkflowPackages,
    enforce: 'pre',
    use: {
      loader: join( __dirname, './webpack_loaders/workflow_validator/index.mjs' )
    }
  } );
  // Use AST-based loader for rewriting steps/workflows
  config.module.rules.push( {
    test: /\.js$/,
    exclude: excludeUnlessExternalWorkflowPackages,
    use: {
      loader: join( __dirname, './webpack_loaders/workflow_rewriter/index.mjs' )
    }
  } );
  return config;
};
