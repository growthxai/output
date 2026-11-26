import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { bundleWorkflows } from './bundle.js';

export async function checkWorkflowBundle( callerDir, bundleOut ) {
  // Workflow discovery logs write to stdout. Keep bundle preparation quiet so its
  // exit code can be used by scripts and CI.
  const originalWrite = process.stdout.write;
  process.stdout.write = ( ...args ) => {
    const callback = args.find( arg => typeof arg === 'function' );
    if ( callback ) {
      callback();
    }
    return true;
  };

  try {
    const { code } = await bundleWorkflows( callerDir );
    if ( bundleOut ) {
      await mkdir( dirname( bundleOut ), { recursive: true } );
      const temporary = `${bundleOut}.${randomUUID()}.tmp`;
      try {
        await writeFile( temporary, code, { flag: 'wx' } );
        await rename( temporary, bundleOut );
      } finally {
        await rm( temporary, { force: true } );
      }
    }
  } finally {
    process.stdout.write = originalWrite;
  }
}
