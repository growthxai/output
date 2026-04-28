import { useEffect, useRef } from 'react';
import {
  getServiceStatus,
  isServiceHealthy,
  isServiceFailed,
  type ServiceStatus
} from '#services/docker.js';
import { fetchWorkflowRuns, type WorkflowRun } from '#services/workflow_runs.js';

export const POLL_INTERVAL_MS = 2000;
export const HEALTH_TIMEOUT_MS = 120_000;

type TickResult = 'done' | 'continue';

export const usePoll = (
  enabled: boolean,
  intervalMs: number,
  onTick: () => Promise<TickResult>
): void => {
  const onTickRef = useRef( onTick );
  onTickRef.current = onTick;

  useEffect( () => {
    const state = {
      active: true,
      timeout: undefined as ReturnType<typeof setTimeout> | undefined
    };

    const run = async (): Promise<void> => {
      if ( !state.active ) {
        return;
      }
      const result = await onTickRef.current();
      if ( !state.active || result === 'done' ) {
        return;
      }
      state.timeout = setTimeout( run, intervalMs );
    };

    if ( enabled ) {
      void run();
    }

    return () => {
      state.active = false;
      clearTimeout( state.timeout );
    };
  }, [ enabled, intervalMs ] );
};

const fetchServices = async ( dockerComposePath: string ): Promise<ServiceStatus[] | null> => {
  try {
    return await getServiceStatus( dockerComposePath );
  } catch {
    return null;
  }
};

export interface HealthPollingCallbacks {
  onServices: ( svcs: ServiceStatus[] ) => void;
  onAllHealthy: ( svcs: ServiceStatus[] ) => void;
  onFailure: ( svcs: ServiceStatus[] ) => void;
  onTimeout: () => void;
}

export const useHealthPolling = (
  dockerComposePath: string,
  enabled: boolean,
  callbacks: HealthPollingCallbacks
): void => {
  const callbacksRef = useRef( callbacks );
  callbacksRef.current = callbacks;
  const startTimeRef = useRef( Date.now() );

  usePoll( enabled, POLL_INTERVAL_MS, async () => {
    if ( Date.now() - startTimeRef.current > HEALTH_TIMEOUT_MS ) {
      callbacksRef.current.onTimeout();
      return 'done';
    }
    const svcs = await fetchServices( dockerComposePath );
    if ( svcs === null ) {
      return 'continue';
    }
    callbacksRef.current.onServices( svcs );
    if ( svcs.length > 0 && svcs.every( isServiceHealthy ) ) {
      callbacksRef.current.onAllHealthy( svcs );
      return 'done';
    }
    if ( svcs.length > 0 && svcs.find( isServiceFailed ) ) {
      callbacksRef.current.onFailure( svcs );
      return 'done';
    }
    return 'continue';
  } );
};

export const useStatusRefresh = (
  dockerComposePath: string,
  enabled: boolean,
  onServices: ( svcs: ServiceStatus[] ) => void
): void => {
  const onServicesRef = useRef( onServices );
  onServicesRef.current = onServices;

  usePoll( enabled, POLL_INTERVAL_MS, async () => {
    const svcs = await fetchServices( dockerComposePath );
    if ( svcs !== null ) {
      onServicesRef.current( svcs );
    }
    return 'continue';
  } );
};

export const useWorkflowRunsPolling = (
  enabled: boolean,
  onRuns: ( runs: WorkflowRun[] ) => void
): void => {
  const onRunsRef = useRef( onRuns );
  onRunsRef.current = onRuns;

  usePoll( enabled, POLL_INTERVAL_MS, async () => {
    try {
      const { runs } = await fetchWorkflowRuns( { limit: 100 } );
      onRunsRef.current( runs );
    } catch {
      // API may not be ready yet
    }
    return 'continue';
  } );
};
