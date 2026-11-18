import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { isServiceFailed, SERVICE_HEALTH, type ServiceStatus } from '#services/docker.js';
import { DockerServiceStatusIcon } from '#views/dev/components/docker_service_status.js';
import { openUrl } from '#utils/open_url.js';
import { LoadingSpinner } from '#views/dev/chrome/loading_spinner.js';
import { SelectionIndicator } from '#views/dev/chrome/selection_indicator.js';
import { useUiState } from '#views/dev/state/ui_state.js';
import { useDockerLogs } from '#views/dev/hooks/use_docker_logs.js';
import { restartService, restartStack } from '#views/dev/services/docker_control.js';
import { ContentTitle, getHeight as getContentTitleHeight } from '#views/dev/components/content_title.js';
import { MasterDetailPanel } from '#views/dev/components/master_detail_panel.js';
import { formatContentTitle, truncate, useListSelection } from '#views/dev/utils/panel_helpers.js';
import type { Phase } from '#views/dev/dev_app.js';

const LOG_WIDTH_PADDING = 8;
const PAUSED_ROWS = 1;

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
  <Box>
    <Box width={COL.indicator}><Text>&nbsp;</Text></Box>
    <Box width={COL.icon}><Text> </Text></Box>
    <Box width={COL.name}><Text dimColor bold>SERVICE</Text></Box>
    <Box width={COL.status}><Text dimColor bold>STATUS</Text></Box>
    <Box width={COL.ports}><Text dimColor bold>PORTS</Text></Box>
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
      <Box width={COL.icon}><DockerServiceStatusIcon status={status} /></Box>
      <Box width={COL.name}><Text bold={selected} wrap="truncate-end">{service.name}</Text></Box>
      <Box width={COL.status}><Text dimColor={!selected} wrap="truncate-end">{status}</Text></Box>
      <Box width={COL.ports}><Text dimColor={!selected} wrap="truncate-end">{ports}</Text></Box>
    </Box>
  );
};

const formatLogLine = ( line: string, maxWidth: number ): string =>
  truncate( line.replace( /\r/g, '' ).replace( /\t/g, '  ' ).trimEnd(), maxWidth );

const serviceLogRowsFor = ( detailRows: number, paused: boolean ): number =>
  Math.max(
    1,
    detailRows - getContentTitleHeight() - ( paused ? PAUSED_ROWS : 0 )
  );

const LogPane: React.FC<{
  serviceName: string | null;
  lines: string[];
  maxLines: number;
  paused: boolean;
}> = ( { serviceName, lines, maxLines, paused } ) => {
  const { stdout } = useStdout();
  const maxLineWidth = Math.max( 20, ( stdout?.columns ?? 120 ) - LOG_WIDTH_PADDING );

  if ( !serviceName ) {
    return <Text dimColor>Select a service to tail its logs.</Text>;
  }
  const visible = lines.slice( -maxLines );
  return (
    <Box flexDirection="column">
      {lines.length === 0 && (
        <LoadingSpinner label={`Waiting for logs from ${serviceName}...`} />
      )}
      {visible.map( ( line, i ) => (
        <Text key={`${i}-${line.length}`} wrap="truncate-end">{formatLogLine( line, maxLineWidth )}</Text>
      ) )}
      {paused && (
        <Box>
          <Text backgroundColor="yellow" color="black"> PAUSED </Text>
          <Text dimColor> press p to resume</Text>
        </Box>
      )}
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

export const SERVICES_HINTS = [
  { key: '↑/↓', label: 'navigate' },
  { key: 'r', label: 'restart' },
  { key: 'ctrl+r', label: 'restart all' },
  { key: 'p', label: 'pause logs' },
  { key: 'c', label: 'clear' },
  { key: 'o', label: 'open url' }
];

export const SERVICES_BOOT_HINTS = [];

interface DetailProps {
  service: ServiceStatus | undefined;
  lines: string[];
  maxLogLines: number;
  paused: boolean;
}

const Detail: React.FC<DetailProps> = ( { service, lines, maxLogLines, paused } ) => {
  if ( !service ) {
    return <Box />;
  }
  return (
    <Box flexDirection="column">
      <ContentTitle title={formatContentTitle( [ `Service "${service?.name}"`, 'Logs' ] )} />
      <Box flexDirection="column">
        <LogPane serviceName={service.name ?? null} lines={lines} maxLines={maxLogLines} paused={paused} />
      </Box>
    </Box>
  );
};

export const ServicesPanel: React.FC<{
  height: number;
  phase: Phase;
  services: ServiceStatus[];
  dockerComposePath: string;
}> = ( { height, phase, services, dockerComposePath } ) => {
  const ui = useUiState();
  const lastFailedCountRef = useRef( 0 );

  const sortedServices = useMemo( () => [ ...services ].sort( compareService ), [ services ] );
  const failedCount = useMemo( () => services.filter( isServiceFailed ).length, [ services ] );
  const { selectedIndex: clamped, selectPrevious, selectNext } = useListSelection( sortedServices.length );
  const selectedService = sortedServices[clamped];
  const isActive = ui.tab === 'services' && !ui.search.open;
  const enabledLogs = isActive && Boolean( selectedService );
  const pushToast = ui.pushToast;

  const logs = useDockerLogs(
    dockerComposePath,
    selectedService?.name ?? null,
    enabledLogs
  );
  useEffect( () => {
    if ( failedCount > 0 && failedCount !== lastFailedCountRef.current ) {
      pushToast( `${failedCount} service${failedCount === 1 ? '' : 's'} failing. See logs and press r to restart.`, 'error' );
    }
    lastFailedCountRef.current = failedCount;
  }, [ failedCount, pushToast ] );

  useInput( ( input, key ) => {
    if ( key.upArrow ) {
      selectPrevious();
      return;
    }
    if ( key.downArrow ) {
      selectNext();
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
        pushToast( `Opened ${url}`, 'info' );
      } else {
        pushToast( `${selectedService.name} has no known URL`, 'error' );
      }
      return;
    }
    if ( !key.ctrl && input === 'r' ) {
      pushToast( `Restarting ${selectedService.name}...`, 'info' );
      restartService( dockerComposePath, selectedService.name )
        .then( () => pushToast( `Restarted ${selectedService.name}`, 'success' ) )
        .catch( err => pushToast( `Restart failed: ${err instanceof Error ? err.message : String( err )}`, 'error' ) );
      return;
    }
    if ( key.ctrl && input === 'r' ) {
      pushToast( 'Restarting all services...', 'info' );
      restartStack( dockerComposePath )
        .then( () => pushToast( 'Restarted all services', 'success' ) )
        .catch( err => pushToast( `Restart failed: ${err instanceof Error ? err.message : String( err )}`, 'error' ) );
    }
  }, { isActive } );

  if ( phase === 'waiting' && services.length === 0 ) {
    return (
      <Box flexDirection="column">
        <LoadingSpinner label="Starting Docker services…" />
      </Box>
    );
  }

  if ( services.length === 0 ) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No services running.</Text>
      </Box>
    );
  }

  return (
    <MasterDetailPanel
      items={sortedServices}
      selectedIndex={clamped}
      height={height}
      visibleRows={sortedServices.length}
      renderHeader={() => <HeaderRow />}
      renderRow={( service, selected ) => <ServiceRow service={service} selected={selected} />}
      rowKey={service => service.name}
      detail={( { detailRows } ) => (
        <Detail
          service={selectedService}
          lines={logs.lines}
          maxLogLines={serviceLogRowsFor( detailRows, logs.paused )}
          paused={logs.paused}
        />
      )}
    />
  );
};
