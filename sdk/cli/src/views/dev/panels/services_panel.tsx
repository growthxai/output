import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { isServiceFailed, SERVICE_HEALTH, type ServiceStatus } from '#services/docker.js';
import { StatusIcon } from '#components/status_icon.js';
import { openUrl } from '#utils/open_url.js';
import { Footer } from '#views/dev/chrome/footer.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { useDockerLogs } from '#views/dev/hooks/use_docker_logs.js';
import { restartService, restartStack } from '#views/dev/services/docker_control.js';
import { MasterDetailPanel } from '#views/dev/components/master_detail_panel.js';
import type { Phase } from '#views/dev/dev_app.js';

const VISIBLE_LOG_LINES = 18;

const resolveServiceStatus = ( service: ServiceStatus ): string =>
  service.health === SERVICE_HEALTH.NONE ? service.state : service.health;

const SERVICE_URLS: Record<string, string> = {
  'temporal-ui': 'http://localhost:8080',
  api: 'http://localhost:3001',
  temporal: 'http://localhost:7233',
  redis: 'redis://localhost:6379'
};

const COL = {
  indicator: 3,
  icon: 3,
  name: 16,
  status: 11,
  ports: 22
};

const HeaderRow: React.FC = () => (
  <Box flexDirection="column">
    <Text bold>Services</Text>
    <Box marginTop={1}>
      <Box width={COL.indicator}><Text> </Text></Box>
      <Box width={COL.icon}><Text> </Text></Box>
      <Box width={COL.name}><Text dimColor bold>SERVICE</Text></Box>
      <Box width={COL.status}><Text dimColor bold>STATUS</Text></Box>
      <Box width={COL.ports}><Text dimColor bold>PORTS</Text></Box>
    </Box>
  </Box>
);

const ServiceRow: React.FC<{ service: ServiceStatus; selected: boolean }> = ( { service, selected } ) => {
  const status = resolveServiceStatus( service );
  const ports = service.ports.length ? service.ports.join( ', ' ) : '-';

  return (
    <Box>
      <Box width={COL.indicator}>
        <SelectionIndicator selected={selected} />
      </Box>
      <Box width={COL.icon}><StatusIcon status={status} /></Box>
      <Box width={COL.name}><Text bold={selected} wrap="truncate-end">{service.name}</Text></Box>
      <Box width={COL.status}><Text dimColor={!selected} wrap="truncate-end">{status}</Text></Box>
      <Box width={COL.ports}><Text dimColor={!selected} wrap="truncate-end">{ports}</Text></Box>
    </Box>
  );
};

const FailureBanner: React.FC<{ services: ServiceStatus[] }> = ( { services } ) => {
  const failed = services.filter( isServiceFailed );
  if ( failed.length === 0 ) {
    return null;
  }
  return (
    <Box marginTop={1}>
      <Text backgroundColor="red" color="white" bold> ⚠️  {failed.length} service(s) failing — see logs and press r to restart </Text>
    </Box>
  );
};

const LogPane: React.FC<{ serviceName: string | null; lines: string[]; paused: boolean }> = ( { serviceName, lines, paused } ) => {
  if ( !serviceName ) {
    return <Text dimColor>Select a service to tail its logs.</Text>;
  }
  if ( lines.length === 0 ) {
    return <LoadingSpinner label={`Waiting for logs from ${serviceName}…`} />;
  }
  const visible = lines.slice( -VISIBLE_LOG_LINES );
  return (
    <Box flexDirection="column">
      {paused && (
        <Box marginBottom={1}>
          <Text backgroundColor="yellow" color="black"> PAUSED </Text>
          <Text dimColor> press p to resume</Text>
        </Box>
      )}
      {visible.map( ( line, i ) => (
        <Text key={`${i}-${line.length}`} wrap="truncate-end">{line}</Text>
      ) )}
    </Box>
  );
};

const SERVICE_PRIORITY = [ 'worker', 'api' ] as const;

/**
 * Worker first (most-watched in development), then API, then everything
 * else alphabetically. Promoting the priority list to a constant keeps
 * the comparator three lines.
 */
export const compareService = ( a: ServiceStatus, b: ServiceStatus ): number => {
  const ai = SERVICE_PRIORITY.indexOf( a.name as typeof SERVICE_PRIORITY[number] );
  const bi = SERVICE_PRIORITY.indexOf( b.name as typeof SERVICE_PRIORITY[number] );
  if ( ai !== -1 || bi !== -1 ) {
    return ( ai === -1 ? Infinity : ai ) - ( bi === -1 ? Infinity : bi );
  }
  return a.name.localeCompare( b.name );
};

const HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: 'r/R', label: 'restart one/all' },
  { key: 'p', label: 'pause logs' },
  { key: 'c', label: 'clear' },
  { key: 'o', label: 'open url' },
  { key: 'tab', label: 'next tab' },
  { key: 'ctrl+c', label: 'stop & quit' }
];

const HINTS_BOOT = [
  { key: 'tab', label: 'next tab' },
  { key: '?', label: 'help' },
  { key: 'ctrl+c', label: 'quit' }
];

interface DetailProps {
  service: ServiceStatus | undefined;
  services: ServiceStatus[];
  lines: string[];
  paused: boolean;
  banner: string | null;
}

const Detail: React.FC<DetailProps> = ( { service, services, lines, paused, banner } ) => (
  <Box flexDirection="column">
    <FailureBanner services={services} />
    <Box marginTop={1}>
      <Text bold>{service?.name ?? 'Logs'}</Text>
    </Box>
    <Box flexDirection="column" marginTop={1}>
      <LogPane serviceName={service?.name ?? null} lines={lines} paused={paused} />
    </Box>
    {banner && (
      <Box marginTop={1}>
        <Text>{banner}</Text>
      </Box>
    )}
  </Box>
);

export const ServicesPanel: React.FC<{
  phase: Phase;
  services: ServiceStatus[];
  dockerComposePath: string;
}> = ( { phase, services, dockerComposePath } ) => {
  const ui = useUiState();
  const [ selectedIndex, setSelectedIndex ] = useState( 0 );
  const [ banner, setBanner ] = useState<string | null>( null );

  const sortedServices = useMemo( () => [ ...services ].sort( compareService ), [ services ] );

  const isActive = ui.tab === 'services' && !ui.search.open && !ui.runModal.open;
  const clamped = Math.min( selectedIndex, Math.max( 0, sortedServices.length - 1 ) );
  const selectedService = sortedServices[clamped];
  const enabledLogs = isActive && phase === 'running' && Boolean( selectedService );

  useEffect( () => {
    if ( clamped !== selectedIndex ) {
      setSelectedIndex( clamped );
    }
  }, [ clamped, selectedIndex ] );

  const logs = useDockerLogs(
    dockerComposePath,
    selectedService?.name ?? null,
    enabledLogs
  );

  useEffect( () => {
    if ( !banner ) {
      return () => {};
    }
    const id = setTimeout( () => setBanner( null ), 3000 );
    return () => clearTimeout( id );
  }, [ banner ] );

  useInput( ( input, key ) => {
    if ( key.upArrow ) {
      setSelectedIndex( i => Math.max( 0, i - 1 ) );
      return;
    }
    if ( key.downArrow ) {
      setSelectedIndex( i => Math.min( sortedServices.length - 1, i + 1 ) );
      return;
    }
    if ( !selectedService ) {
      return;
    }
    if ( input === 'p' ) {
      logs.setPaused( !logs.paused );
      return;
    }
    if ( input === 'c' ) {
      logs.clear();
      return;
    }
    if ( input === 'o' ) {
      const url = SERVICE_URLS[selectedService.name];
      if ( url ) {
        openUrl( url );
        setBanner( `Opened ${url}` );
      } else {
        setBanner( `${selectedService.name} has no known URL` );
      }
      return;
    }
    if ( input === 'r' ) {
      setBanner( `Restarting ${selectedService.name}…` );
      restartService( dockerComposePath, selectedService.name )
        .then( () => setBanner( `Restarted ${selectedService.name}` ) )
        .catch( err => setBanner( `Restart failed: ${err instanceof Error ? err.message : String( err )}` ) );
      return;
    }
    if ( input === 'R' ) {
      setBanner( 'Restarting all services…' );
      restartStack( dockerComposePath )
        .then( () => setBanner( 'Restarted all services' ) )
        .catch( err => setBanner( `Restart failed: ${err instanceof Error ? err.message : String( err )}` ) );
    }
  }, { isActive } );

  if ( phase === 'waiting' && services.length === 0 ) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <LoadingSpinner label="Starting Docker services…" />
        <Footer hints={HINTS_BOOT} />
      </Box>
    );
  }

  if ( services.length === 0 ) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>No services running.</Text>
        <Footer hints={HINTS_BOOT} />
      </Box>
    );
  }

  return (
    <MasterDetailPanel
      items={sortedServices}
      selectedIndex={clamped}
      visibleRows={sortedServices.length}
      renderHeader={() => <HeaderRow />}
      renderRow={( service, selected ) => <ServiceRow service={service} selected={selected} />}
      rowKey={service => service.name}
      detail={
        <Detail
          service={selectedService}
          services={services}
          lines={logs.lines}
          paused={logs.paused}
          banner={banner}
        />
      }
      hints={phase === 'running' ? HINTS : HINTS_BOOT}
      itemLabel="services"
    />
  );
};
