import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const run = ( args: string[] ): Promise<void> => new Promise( ( resolve, reject ) => {
  const child = spawn( 'docker', args, { stdio: 'pipe' } );
  const stderrChunks: string[] = [];
  child.stderr.on( 'data', chunk => {
    stderrChunks.push( chunk.toString() );
  } );
  child.on( 'error', reject );
  child.on( 'exit', code => {
    if ( code === 0 ) {
      resolve();
      return;
    }
    const stderr = stderrChunks.join( '' ).trim();
    reject( new Error( stderr || `docker ${args.join( ' ' )} exited with code ${code}` ) );
  } );
} );

export const restartService = ( dockerComposePath: string, serviceName: string ): Promise<void> =>
  run( [ 'compose', '-f', dockerComposePath, 'restart', serviceName ] );

export const restartStack = ( dockerComposePath: string ): Promise<void> =>
  run( [ 'compose', '-f', dockerComposePath, 'restart' ] );

export const stopService = ( dockerComposePath: string, serviceName: string ): Promise<void> =>
  run( [ 'compose', '-f', dockerComposePath, 'stop', serviceName ] );

export const tailLogs = (
  dockerComposePath: string,
  serviceName: string,
  tailLines: number = 200
): ChildProcessWithoutNullStreams => spawn(
  'docker',
  [ 'compose', '-f', dockerComposePath, 'logs', '-f', '--no-color', '--tail', String( tailLines ), serviceName ],
  { stdio: 'pipe' }
);
