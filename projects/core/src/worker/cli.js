import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseWorkerArguments } from './arguments.js';

try {
  const { callerDir, check, bundleOut, help, workflowBundlePath } = parseWorkerArguments();

  if ( help ) {
    console.log( `Usage: output-worker [--check] [--bundle-out <path>] [--workflow-bundle <path>]

  --check                   Check workflow bundling without connecting to Temporal.
  --bundle-out <path>       Bundle workflows and write the bundle to a file.
  --workflow-bundle <path>  Start the worker with a bundle from the same build.` );
  } else if ( check ) {
    const { checkWorkflowBundle } = await import( './check.js' );
    await checkWorkflowBundle( callerDir, bundleOut );
    process.exit( 0 );
  } else {
    if ( workflowBundlePath ) {
      await access( workflowBundlePath, constants.R_OK );
      const info = await stat( workflowBundlePath );
      if ( !info.isFile() || info.size === 0 ) {
        throw new Error( `Workflow bundle must be a nonempty file: ${workflowBundlePath}` );
      }
    }
    await import( './index.js' );
  }
} catch ( error ) {
  console.error( error instanceof Error ? error.message : String( error ) );
  process.exit( 1 );
}
