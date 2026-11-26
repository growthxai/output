import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export function parseWorkerArguments( argv = process.argv.slice( 2 ) ) {
  const [ callerDir = process.cwd(), ...args ] = argv;
  const { values } = parseArgs( {
    args,
    options: {
      check: { type: 'boolean' },
      'bundle-out': { type: 'string' },
      'workflow-bundle': { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    }
  } );

  const check = values.check || values['bundle-out'] !== undefined;
  if ( check && values['workflow-bundle'] !== undefined ) {
    throw new Error( '--workflow-bundle cannot be combined with --check or --bundle-out.' );
  }

  return {
    callerDir,
    check,
    help: values.help,
    bundleOut: values['bundle-out'] === undefined ? undefined : resolve( callerDir, values['bundle-out'] ),
    workflowBundlePath: values['workflow-bundle'] === undefined ? undefined : resolve( callerDir, values['workflow-bundle'] )
  };
}
