import { createChildLogger } from '#logger';
import { bundleWorkflows } from './bundle.js';

const log = createChildLogger( 'WorkflowCheck' );

// `output-worker --check` entry: bundle the workflows exactly as the worker would, then
// exit. Runs without a Temporal connection, the worker run loop, or worker runtime config
// (e.g. OUTPUT_CATALOG_ID) — surfacing bad workflow imports (e.g. `node:` built-ins) at
// build/CI time instead of crash-looping the worker at startup.
const callerDir = process.argv[2] ?? process.cwd();

( async () => {
  log.info( 'Checking workflow bundle...', { callerDir } );
  await bundleWorkflows( callerDir );
  log.info( '✓ Workflow bundle check passed' );
  process.exit( 0 );
} )().catch( error => {
  log.error( '✗ Workflow bundle check failed', { message: error?.message, stack: error?.stack } );
  process.exit( 1 );
} );
