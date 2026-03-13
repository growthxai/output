import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const workerDir = __dirname; // sdk/core/src/worker
const interfaceDir = join( __dirname, '..', 'interface' );

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
    // Exclude node_modules and internal core worker files
    exclude: resource => /node_modules/.test( resource ) || resource.startsWith( workerDir ) || resource.startsWith( interfaceDir ),
    enforce: 'pre',
    use: {
      loader: join( __dirname, './webpack_loaders/workflow_validator/index.mjs' )
    }
  } );
  // Use AST-based loader for rewriting steps/workflows
  config.module.rules.push( {
    test: /\.js$/,
    // Exclude node_modules and internal core worker files
    exclude: resource => /node_modules/.test( resource ) || resource.startsWith( workerDir ) || resource.startsWith( interfaceDir ),
    use: {
      loader: join( __dirname, './webpack_loaders/workflow_rewriter/index.mjs' )
    }
  } );
  return config;
};
