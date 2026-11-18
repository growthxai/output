import { useEffect, useRef, useState } from 'react';
import { tailLogs } from '#views/dev/services/docker_control.js';

const MAX_BUFFER = 2000;

export interface DockerLogsState {
  lines: string[];
  paused: boolean;
  setPaused: ( paused: boolean ) => void;
  clear: () => void;
}

export const useDockerLogs = (
  dockerComposePath: string,
  serviceName: string | null,
  enabled: boolean
): DockerLogsState => {
  const [ lines, setLines ] = useState<string[]>( [] );
  const [ paused, setPaused ] = useState( false );
  const pausedRef = useRef( paused );
  pausedRef.current = paused;
  const bufferRef = useRef<string[]>( [] );

  useEffect( () => {
    bufferRef.current = [];
    setLines( [] );

    if ( !enabled || !serviceName ) {
      return () => {};
    }

    const child = tailLogs( dockerComposePath, serviceName );
    const pending: string[] = [];
    const timer = { id: null as ReturnType<typeof setTimeout> | null };

    const flush = (): void => {
      if ( pending.length === 0 ) {
        return;
      }
      bufferRef.current = [ ...bufferRef.current, ...pending ].slice( -MAX_BUFFER );
      pending.length = 0;
      if ( !pausedRef.current ) {
        setLines( bufferRef.current );
      }
    };

    const onChunk = ( chunk: Buffer ): void => {
      const text = chunk.toString();
      const split = text.split( '\n' ).filter( ( l, i, arr ) => i < arr.length - 1 || l.length > 0 );
      pending.push( ...split );
      if ( timer.id === null ) {
        timer.id = setTimeout( () => {
          timer.id = null;
          flush();
        }, 100 );
      }
    };

    child.stdout.on( 'data', onChunk );
    child.stderr.on( 'data', onChunk );
    // Swallow spawn errors. Docker isn't reachable in only two cases the
    // user can't act on inside this panel: the daemon stopped (the
    // services list will already show this) and the binary is missing
    // (ruled out by `validateDockerEnvironment` at startup). The user
    // can always tail logs from a host shell as a fallback.
    child.on( 'error', () => {} );

    return () => {
      child.kill( 'SIGTERM' );
      if ( timer.id !== null ) {
        clearTimeout( timer.id );
      }
    };
  }, [ dockerComposePath, serviceName, enabled ] );

  useEffect( () => {
    if ( !paused ) {
      setLines( bufferRef.current );
    }
  }, [ paused ] );

  return {
    lines,
    paused,
    setPaused,
    clear: () => {
      bufferRef.current = [];
      setLines( [] );
    }
  };
};
