import { bundleWorkflows } from './bundle.js';

// `output-worker --check` entry: bundle the workflows exactly as the worker would, then
// exit 0 (ok) / 1 (fail). The exit code is the signal — no formatted output, so it drops
// cleanly into CI and other tooling. Surfaces bad workflow imports (e.g. `node:` built-ins)
// at build/CI time instead of crash-looping the worker at startup.
const callerDir = process.argv[2] ?? process.cwd();

( async () => {
  await bundleWorkflows( callerDir );
  process.exit( 0 );
} )().catch( error => {
  console.error( error );
  process.exit( 1 );
} );
