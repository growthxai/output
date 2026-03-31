import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import {
  getServiceStatus,
  isServiceHealthy,
  isServiceFailed,
  SERVICE_HEALTH,
  SERVICE_STATE
} from '#services/docker.js';
import type { ServiceStatus } from '#services/docker.js';
import { config } from '#config.js';

const POLL_INTERVAL_MS = 2000;
const HEALTH_TIMEOUT_MS = 120_000;

const STATUS_ICONS: Record<string, string> = {
  [SERVICE_HEALTH.HEALTHY]: '●',
  [SERVICE_HEALTH.UNHEALTHY]: '○',
  [SERVICE_HEALTH.STARTING]: '◐',
  [SERVICE_HEALTH.NONE]: '●',
  [SERVICE_STATE.RUNNING]: '●',
  [SERVICE_STATE.EXITED]: '✗'
};

const STATUS_COLORS: Record<string, string> = {
  [SERVICE_HEALTH.HEALTHY]: 'green',
  [SERVICE_HEALTH.UNHEALTHY]: 'red',
  [SERVICE_HEALTH.STARTING]: 'yellow',
  [SERVICE_HEALTH.NONE]: 'blue',
  [SERVICE_STATE.RUNNING]: 'blue',
  [SERVICE_STATE.EXITED]: 'red'
};

const ServiceRow: React.FC<{ service: ServiceStatus }> = ( { service } ) => {
  const healthKey = service.health === SERVICE_HEALTH.NONE ? service.state : service.health;
  const icon = STATUS_ICONS[healthKey] ?? '?';
  const color = STATUS_COLORS[healthKey] ?? 'white';
  const status = service.health === SERVICE_HEALTH.NONE ? service.state : service.health;
  const ports = service.ports.length ? service.ports.join( ', ' ) : '-';

  return (
    <Box>
      <Text color={color}>{icon} </Text>
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
          <Box marginTop={1}>
            <Text dimColor>Check the logs with: docker compose logs worker</Text>
          </Box>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>{'Check the logs with: docker compose logs <service-name>'}</Text>
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
      <Text dimColor>{divider}</Text>
      <Box>
        <Text color="green" bold>{'✅ SUCCESS! '}</Text>
        <Text bold>Development services are running</Text>
      </Box>
      <Text dimColor>{divider}</Text>
      <Text bold>🐳 SERVICES</Text>
      <Box flexDirection="column" marginLeft={2} marginBottom={1}>
        <Box><Text color="white">{'Temporal:    '}</Text><Text color="yellow">localhost:7233</Text></Box>
        <Box><Text color="white">{'Temporal UI: '}</Text><Text color="cyan">http://localhost:8080</Text></Box>
        <Box><Text color="white">{'API Server:  '}</Text><Text color="yellow">localhost:3001</Text></Box>
        <Box><Text color="white">{'Redis:       '}</Text><Text color="yellow">localhost:6379</Text></Box>
      </Box>
      <Text dimColor>{divider}</Text>
      <Text bold>🚀 RUN A WORKFLOW</Text>
      <Box flexDirection="column" marginLeft={2} marginBottom={1}>
        <Text color="white">In a new terminal, execute:</Text>
        <Box marginLeft={2}>
          <Text color="cyan">npx output workflow run blog_evaluator paulgraham_hwh</Text>
        </Box>
      </Box>
      <Text dimColor>{divider}</Text>
      <Text bold>⚡ USEFUL COMMANDS</Text>
      <Box flexDirection="column" marginLeft={2} marginBottom={1}>
        <Box><Text color="white">{'Open Temporal UI: '}</Text><Text color="cyan">open http://localhost:8080</Text></Box>
        <Box><Text color="white">{'View logs:        '}</Text><Text color="cyan">{logsCommand}</Text></Box>
        <Box><Text color="white">{'Stop services:    '}</Text><Text color="cyan">Press Ctrl+C</Text></Box>
      </Box>
      <Text dimColor>{divider}</Text>
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

const RunningView: React.FC<{ services: ServiceStatus[] }> = ( { services } ) => (
  <Box flexDirection="column">
    <Text bold>📊 Service Status</Text>
    <Box flexDirection="column" marginTop={1}>
      {services.map( s => <ServiceRow key={s.name} service={s} /> )}
    </Box>
    <FailureWarning services={services} />
    <Box marginTop={1}>
      <Text color="cyan">{'🌐 Temporal UI: '}</Text>
      <Text bold>http://localhost:8080</Text>
    </Box>
    <Text dimColor>Press Ctrl+C to stop services</Text>
  </Box>
);

type Phase = 'waiting' | 'running';

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
  const isExitingRef = useRef( false );

  // Phase 1: poll until all services healthy or 120s timeout
  useEffect( () => {
    const state = {
      active: true,
      timeout: undefined as ReturnType<typeof setTimeout> | undefined
    };
    const startTime = Date.now();

    if ( phase === 'waiting' ) {
      const poll = async (): Promise<void> => {
        if ( !state.active ) {
          return;
        }

        if ( Date.now() - startTime > HEALTH_TIMEOUT_MS ) {
          exit( new Error( 'Timeout waiting for services to become healthy' ) );
          return;
        }

        try {
          const svcs = await getServiceStatus( dockerComposePath );
          if ( !state.active ) {
            return;
          }
          setServices( svcs );
          if ( svcs.length > 0 && svcs.every( isServiceHealthy ) ) {
            setSuccessItems( [ { id: 'success', services: svcs } ] );
            setPhase( 'running' );
            return;
          }
        } catch {
          // retry on next tick
        }

        if ( state.active ) {
          state.timeout = setTimeout( poll, POLL_INTERVAL_MS );
        }
      };

      void poll();
    }

    return () => {
      state.active = false;
      clearTimeout( state.timeout );
    };
  }, [ phase, dockerComposePath, exit ] );

  // Phase 2: continuous 2-second status refresh
  useEffect( () => {
    const state = {
      active: true,
      timeout: undefined as ReturnType<typeof setTimeout> | undefined
    };

    if ( phase === 'running' ) {
      const poll = async (): Promise<void> => {
        try {
          const svcs = await getServiceStatus( dockerComposePath );
          if ( state.active ) {
            setServices( svcs );
          }
        } catch {
          // silent retry
        }
        if ( state.active ) {
          state.timeout = setTimeout( poll, POLL_INTERVAL_MS );
        }
      };

      state.timeout = setTimeout( poll, POLL_INTERVAL_MS );
    }

    return () => {
      state.active = false;
      clearTimeout( state.timeout );
    };
  }, [ phase, dockerComposePath ] );

  useInput( ( input, key ) => {
    if ( key.ctrl && input === 'c' && !isExitingRef.current ) {
      isExitingRef.current = true;
      void onCleanup().then( () => exit() ).catch( () => exit() );
    }
  } );

  return (
    <>
      <Static items={successItems}>
        {item => (
          <DevSuccessMessage key={item.id} services={item.services} />
        )}
      </Static>
      {phase === 'waiting' && <WaitingView services={services} />}
      {phase === 'running' && <RunningView services={services} />}
    </>
  );
};
