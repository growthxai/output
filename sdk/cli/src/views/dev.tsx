import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import {
  getServiceStatus,
  isServiceHealthy,
  isServiceFailed,
  SERVICE_HEALTH
} from '#services/docker.js';
import type { ServiceStatus } from '#services/docker.js';
import { config } from '#config.js';
import { fetchWorkflowRuns } from '#services/workflow_runs.js';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { openUrl } from '#utils/open_url.js';
import { StatusIcon, statusColor } from '#components/status_icon.js';
import { WorkflowListView } from '#views/workflow/list.js';

const POLL_INTERVAL_MS = 2000;
const HEALTH_TIMEOUT_MS = 120_000;

const resolveServiceStatus = ( service: ServiceStatus ): string =>
  service.health === SERVICE_HEALTH.NONE ? service.state : service.health;

const fetchServices = async ( dockerComposePath: string ): Promise<ServiceStatus[] | null> => {
  try {
    return await getServiceStatus( dockerComposePath );
  } catch {
    return null;
  }
};

type TickResult = 'done' | 'continue';

const usePoll = ( enabled: boolean, onTick: () => Promise<TickResult> ): void => {
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
      state.timeout = setTimeout( run, POLL_INTERVAL_MS );
    };

    if ( enabled ) {
      void run();
    }

    return () => {
      state.active = false;
      clearTimeout( state.timeout );
    };
  }, [ enabled ] );
};

const useHealthPolling = (
  dockerComposePath: string,
  enabled: boolean,
  callbacks: {
    onServices: ( svcs: ServiceStatus[] ) => void;
    onAllHealthy: ( svcs: ServiceStatus[] ) => void;
    onFailure: ( svcs: ServiceStatus[] ) => void;
    onTimeout: () => void;
  }
): void => {
  const callbacksRef = useRef( callbacks );
  callbacksRef.current = callbacks;
  const startTimeRef = useRef( Date.now() );

  usePoll( enabled, async () => {
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

const useStatusRefresh = (
  dockerComposePath: string,
  enabled: boolean,
  onServices: ( svcs: ServiceStatus[] ) => void
): void => {
  const onServicesRef = useRef( onServices );
  onServicesRef.current = onServices;

  usePoll( enabled, async () => {
    const svcs = await fetchServices( dockerComposePath );
    if ( svcs !== null ) {
      onServicesRef.current( svcs );
    }
    return 'continue';
  } );
};

const useWorkflowPolling = (
  enabled: boolean,
  onRuns: ( runs: WorkflowRun[] ) => void
): void => {
  const onRunsRef = useRef( onRuns );
  onRunsRef.current = onRuns;

  usePoll( enabled, async () => {
    try {
      const { runs } = await fetchWorkflowRuns( { limit: 100 } );
      onRunsRef.current( runs );
    } catch {
      // API may not be ready yet
    }
    return 'continue';
  } );
};

const useMainViewInput = (
  isActive: boolean,
  callbacks: { onOpenTemporal: () => void; onOpenWorkflows: () => void }
): void => {
  const callbacksRef = useRef( callbacks );
  callbacksRef.current = callbacks;

  useInput( input => {
    if ( input === 'o' ) {
      callbacksRef.current.onOpenTemporal();
    }
    if ( input === 'w' ) {
      callbacksRef.current.onOpenWorkflows();
    }
  }, { isActive } );
};

const useCtrlC = ( onCleanup: () => Promise<void> ): void => {
  const { exit } = useApp();
  const isExitingRef = useRef( false );

  useInput( ( input, key ) => {
    if ( key.ctrl && input === 'c' && !isExitingRef.current ) {
      isExitingRef.current = true;
      void onCleanup().then( () => exit() ).catch( err => exit( err instanceof Error ? err : new Error( String( err ) ) ) );
    }
  } );
};

const ServiceRow: React.FC<{ service: ServiceStatus }> = ( { service } ) => {
  const status = resolveServiceStatus( service );
  const ports = service.ports.length ? service.ports.join( ', ' ) : '-';

  return (
    <Box>
      <Box width={3}><StatusIcon status={status} /></Box>
      <Box width={16}><Text>{service.name}</Text></Box>
      <Text dimColor>{status.padEnd( 10 )}</Text>
      <Text dimColor>{ports}</Text>
    </Box>
  );
};

const FailureWarning: React.FC<{ services: ServiceStatus[] }> = ( { services } ) => {
  const failed = services.filter( isServiceFailed );
  if ( failed.length === 0 ) {
    return null;
  }

  const failedNames = failed.map( s => s.name ).join( ', ' );
  const hasWorker = failed.some( s => s.name.toLowerCase().includes( 'worker' ) );

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text backgroundColor="red" color="white" bold> ⚠️  SERVICE FAILURE DETECTED </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="red" bold>Failed services: </Text>
        <Text>{failedNames}</Text>
      </Box>
      {hasWorker ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>⚡ The worker is not running!</Text>
          <Text color="yellow">{'   Workflows will fail until the worker is restarted.'}</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text>🔍 Check the logs with: <Text color="magenta">docker compose logs worker</Text></Text>
          </Box>
          <Box flexDirection="column" marginTop={1}>
            <Text>🔧 If you just updated <Text italic>@outputai/cli</Text>, try: <Text color="magenta">output fix</Text></Text>
          </Box>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text>🔍 Check the logs with: <Text color="magenta">docker compose logs &lt;service-name&gt;</Text></Text>
        </Box>
      )}
    </Box>
  );
};

const DevSuccessMessage: React.FC<{ services: ServiceStatus[] }> = ( { services } ) => {
  const divider = '─'.repeat( 80 );
  const sortedNames = services.map( s => s.name ).sort().join( '|' );
  const logsCommand = `docker compose -p ${config.dockerServiceName} logs -f <${sortedNames}>`;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginTop={1} marginBottom={1}><Text dimColor>{divider}</Text></Box>
      <Box>
        <Text color="green" bold>{'✅ SUCCESS! '}</Text>
        <Text bold>Development services are running</Text>
      </Box>
      <Box marginTop={1} marginBottom={1}><Text dimColor>{divider}</Text></Box>
      <Box marginBottom={1}><Text bold>🐳 SERVICES</Text></Box>
      <Box flexDirection="column" marginLeft={2}>
        <Box><Text color="white">{'Temporal:    '}</Text><Text color="yellow">localhost:7233</Text></Box>
        <Box><Text color="white">{'Temporal UI: '}</Text><Text color="cyan">http://localhost:8080</Text></Box>
        <Box><Text color="white">{'API Server:  '}</Text><Text color="yellow">localhost:3001</Text></Box>
        <Box><Text color="white">{'Redis:       '}</Text><Text color="yellow">localhost:6379</Text></Box>
      </Box>
      <Box marginTop={1} marginBottom={1}><Text dimColor>{divider}</Text></Box>
      <Box marginBottom={1}><Text bold>🚀 RUN A WORKFLOW</Text></Box>
      <Box flexDirection="column" marginLeft={2}>
        <Text color="white">In a new terminal, execute:</Text>
        <Box marginLeft={2}>
          <Text color="cyan">npx output workflow run blog_evaluator paulgraham_hwh</Text>
        </Box>
      </Box>
      <Box marginTop={1} marginBottom={1}><Text dimColor>{divider}</Text></Box>
      <Box marginBottom={1}><Text bold>⚡ USEFUL COMMANDS</Text></Box>
      <Box flexDirection="column" marginLeft={2}>
        <Box><Text color="white">{'Open Temporal UI: '}</Text><Text color="cyan">open http://localhost:8080</Text></Box>
        <Box><Text color="white">{'View logs:        '}</Text><Text color="cyan">{logsCommand}</Text></Box>
        <Box><Text color="white">{'Stop services:    '}</Text><Text color="cyan">Press Ctrl+C</Text></Box>
      </Box>
      <Box marginTop={1} marginBottom={1}><Text dimColor>{divider}</Text></Box>
      <Text dimColor>💡 Tip: The Temporal UI lets you monitor workflow executions in real-time</Text>
    </Box>
  );
};

const WaitingView: React.FC<{ services: ServiceStatus[] }> = ( { services } ) => (
  <Box flexDirection="column">
    <Box>
      <Text color="yellow"><Spinner type="dots" /></Text>
      <Text> Waiting for services to become healthy...</Text>
    </Box>
    {services.length > 0 && (
      <Box flexDirection="column" marginTop={1}>
        {services.map( s => <ServiceRow key={s.name} service={s} /> )}
      </Box>
    )}
  </Box>
);

interface WorkflowSummary {
  running: number;
  completed: number;
  failed: number;
  total: number;
}

const RunningView: React.FC<{
  services: ServiceStatus[];
  workflowSummary: WorkflowSummary | null;
}> = ( { services, workflowSummary } ) => (
  <Box flexDirection="column">
    <Text bold>📊 Service Status</Text>
    <Box flexDirection="column" marginTop={1}>
      {services.map( s => <ServiceRow key={s.name} service={s} /> )}
    </Box>
    <FailureWarning services={services} />
    {workflowSummary && (
      <Box marginTop={1}>
        <Text bold>{'📋 Workflows '}</Text>
        <Text>(</Text>
        <Text color={statusColor( 'running' )}>{workflowSummary.running} running</Text>
        <Text>, </Text>
        <Text color={statusColor( 'failed' )}>{workflowSummary.failed} failed</Text>
        <Text>, </Text>
        <Text color={statusColor( 'completed' )}>{workflowSummary.completed} complete</Text>
        <Text>)</Text>
      </Box>
    )}
    <Box marginTop={1}>
      <Text color="cyan">{'🌐 Temporal UI: '}</Text>
      <Text bold>http://localhost:8080</Text>
    </Box>
    <Box marginTop={1}>
      <Text dimColor>{'('}</Text><Text dimColor bold>o</Text><Text dimColor>{')'}</Text><Text dimColor> open ui</Text>
      <Text dimColor>{' | '}</Text>
      <Text dimColor>{'('}</Text><Text dimColor bold>w</Text><Text dimColor>{')'}</Text><Text dimColor> view workflow runs</Text>
      <Text dimColor>{' | '}</Text>
      <Text dimColor>{'('}</Text><Text dimColor bold>ctrl+c</Text><Text dimColor>{')'}</Text><Text dimColor> stop</Text>
    </Box>
  </Box>
);

type Phase = 'waiting' | 'running' | 'failed';
type ActiveView = 'main' | 'workflows';

interface SuccessItem {
  id: string;
  services: ServiceStatus[];
}

export const DevApp: React.FC<{
  dockerComposePath: string;
  onCleanup: () => Promise<void>;
}> = ( { dockerComposePath, onCleanup } ) => {
  const { exit } = useApp();
  const [ phase, setPhase ] = useState<Phase>( 'waiting' );
  const [ services, setServices ] = useState<ServiceStatus[]>( [] );
  const [ successItems, setSuccessItems ] = useState<SuccessItem[]>( [] );
  const [ activeView, setActiveView ] = useState<ActiveView>( 'main' );
  const [ workflowRuns, setWorkflowRuns ] = useState<WorkflowRun[]>( [] );

  useHealthPolling( dockerComposePath, phase === 'waiting', {
    onServices: setServices,
    onAllHealthy: svcs => {
      setSuccessItems( [ { id: 'success', services: svcs } ] );
      setPhase( 'running' );
    },
    onFailure: () => {
      setPhase( 'failed' );
    },
    onTimeout: () => exit( new Error( 'Timeout waiting for services to become healthy' ) )
  } );

  useStatusRefresh( dockerComposePath, phase === 'running', setServices );

  useWorkflowPolling(
    phase === 'running' || phase === 'failed',
    setWorkflowRuns
  );

  useMainViewInput(
    activeView === 'main' && phase !== 'waiting',
    {
      onOpenTemporal: () => openUrl( 'http://localhost:8080' ),
      onOpenWorkflows: () => setActiveView( 'workflows' )
    }
  );

  useCtrlC( onCleanup );

  const workflowSummary: WorkflowSummary | null = workflowRuns.length > 0 ? {
    running: workflowRuns.filter( r => r.status === 'running' ).length,
    completed: workflowRuns.filter( r => r.status === 'completed' ).length,
    failed: workflowRuns.filter( r => r.status === 'failed' ).length,
    total: workflowRuns.length
  } : null;

  return (
    <>
      <Static items={successItems}>
        {item => <DevSuccessMessage key={item.id} services={item.services} />}
      </Static>
      {activeView === 'main' && phase === 'waiting' && <WaitingView services={services} />}
      {activeView === 'main' && phase === 'running' && (
        <RunningView services={services} workflowSummary={workflowSummary} />
      )}
      {activeView === 'main' && phase === 'failed' && (
        <RunningView services={services} workflowSummary={workflowSummary} />
      )}
      {activeView === 'workflows' && (
        <WorkflowListView
          runs={workflowRuns}
          onBack={() => setActiveView( 'main' )}
        />
      )}
    </>
  );
};
