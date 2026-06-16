import { bundleWorkflows } from './bundle.js';

// `output-worker --check` entry: bundle the workflows exactly as the worker would, then
// exit 0 (ok) / 1 (fail). The exit code is the signal. Workflow-discovery logs write to
// stdout via the worker logger, so mute stdout to keep output clean for CI/tooling; only
// real errors surface, on stderr. Catches bad workflow imports (e.g. `node:` built-ins)
// at build/CI time instead of crash-looping the worker at startup.
const callerDir = process.argv[2] ?? process.cwd();

process.stdout.write = ( ...args ) => {
  const callback = args.find( arg => typeof arg === 'function' );
  if ( callback ) {
    callback();
  }
  return true;
};

( async () => {
  await bundleWorkflows( callerDir );
  process.exit( 0 );
} )().catch( error => {
  console.error( error );
  process.exit( 1 );
} );
