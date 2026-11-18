import { spawn } from 'node:child_process';
import { ux } from '@oclif/core';
import debugFactory from 'debug';
import { getErrorMessage } from './error_utils.js';

const debug = debugFactory( 'output-cli:process' );

export async function executeCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ stderr: string[] }> {
  const stderrLines: string[] = [];
  const proc = spawn( command, args, { cwd } );

  const handleStdout = ( data: Buffer ) => {
    const line = data.toString().trim();
    if ( line ) {
      debug( line );
    }
  };

  const handleStderr = ( data: Buffer ) => {
    const line = data.toString().trim();
    if ( line ) {
      stderrLines.push( line );
      debug( line );
    }
  };

  proc.stdout.on( 'data', handleStdout );
  proc.stderr.on( 'data', handleStderr );

  return new Promise( ( resolve, reject ) => {
    proc.on( 'error', ( error: Error ) => {
      reject( new Error( `Failed to run ${command}: ${error.message}` ) );
    } );

    proc.on( 'exit', ( code: number | null ) => {
      if ( code !== 0 ) {
        reject( new Error( `${command} exited with code ${code || 'unknown'}` ) );
      } else {
        resolve( { stderr: stderrLines } );
      }
    } );
  } );
}

export async function executeCommandWithMessages(
  command: () => Promise<void>,
  startMessage: string,
  successMessage: string
): Promise<boolean> {
  try {
    ux.stdout( startMessage );
    await command();
    ux.stdout( successMessage );
    return true;
  } catch ( error: unknown ) {
    const message = getErrorMessage( error );
    ux.warn( `⚠️  ${message}` );
    return false;
  }
}
