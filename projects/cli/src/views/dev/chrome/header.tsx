import React from 'react';
import { Box, Text, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { LOGO_GRADIENT, PURPLE_100 } from '#views/dev/chrome/palette.js';

export interface WorkflowSummary {
  running: number;
  completed: number;
  failed: number;
  total: number;
}

const LOGO_PIXELS = [
  '▟▀▀▙▐▌ ▐▌▀▜▛▀▐▛▀▙▐▌ ▐▌▀▜▛▀',
  '█  █▐▌ ▐▌ ▐▌ ▐▛▀▘▐▌ ▐▌ ▐▌ ',
  '▝▀▀▘ ▀▀▀  ▝▘ ▝▘   ▀▀▀  ▝▘ '
];

const HEADER_MARGIN = 1;
const COMPACT_HEIGHT_THRESHOLD = 50;
const COMPACT_HEADER_ROWS = 1;
const FULL_HEADER_ROWS = 3;

const getLogoHeight = ( terminalRows: number ): number =>
  terminalRows < COMPACT_HEIGHT_THRESHOLD ? COMPACT_HEADER_ROWS : FULL_HEADER_ROWS;

export const getHeight = ( terminalRows: number ): number => getLogoHeight( terminalRows ) + HEADER_MARGIN;

export const useHeaderRows = (): number => {
  const { stdout } = useStdout();
  return getLogoHeight( stdout?.rows ?? 60 );
};

export type ServiceBadge = 'healthy' | 'starting' | 'failed';

export interface HeaderCounters {
  running: number;
  failed: number;
  totalWorkflows: number;
  totalRuns: number;
  serviceBadge: ServiceBadge;
  failingServices: number;
}

const ServicesBadge: React.FC<{ badge: ServiceBadge; failingCount: number }> = ( { badge, failingCount } ) => {
  if ( badge === 'failed' ) {
    return (
      <Text color="red" bold>
        ⚠ {failingCount} service{failingCount === 1 ? '' : 's'} down
      </Text>
    );
  }
  if ( badge === 'starting' ) {
    return (
      <>
        <Text color="yellow"><Spinner type="dots" /></Text>
        <Text> services</Text>
      </>
    );
  }
  return (
    <>
      <Text color="green">● </Text>
      <Text>services</Text>
    </>
  );
};

const Counters: React.FC<{ counters: HeaderCounters }> = ( { counters } ) => (
  <Box flexDirection="row">
    <Box marginRight={3}>
      <ServicesBadge badge={counters.serviceBadge} failingCount={counters.failingServices} />
    </Box>
    {counters.running > 0 && (
      <Box marginRight={3}>
        <Text color="blue">● </Text>
        <Text bold>{counters.running} </Text>
        <Text>running</Text>
      </Box>
    )}
    {counters.failed > 0 && (
      <Box marginRight={3}>
        <Text color="red">✗ </Text>
        <Text color="red" bold>{counters.failed} </Text>
        <Text color="red">failed</Text>
      </Box>
    )}
    <Box>
      <Text dimColor>{counters.totalWorkflows} workflows · {counters.totalRuns} runs</Text>
    </Box>
  </Box>
);

const Logo: React.FC<{ compact: boolean }> = ( { compact } ) => (
  <Box flexDirection="column">
    {compact ?
      <Text color={PURPLE_100} bold>OUTPUT</Text> :
      LOGO_PIXELS.map( ( line, i ) => (
        <Text key={i} color={LOGO_GRADIENT[i] ?? PURPLE_100} bold>{line}</Text>
      ) )}
  </Box>
);

export const buildSummaryCounters = (
  summary: WorkflowSummary | null,
  totalWorkflows: number,
  serviceBadge: ServiceBadge = 'starting',
  failingServices: number = 0
): HeaderCounters => ( {
  running: summary?.running ?? 0,
  failed: summary?.failed ?? 0,
  totalWorkflows,
  totalRuns: summary?.total ?? 0,
  serviceBadge,
  failingServices
} );

export const Header: React.FC<{ counters: HeaderCounters }> = ( { counters } ) => {
  const headerRows = useHeaderRows();
  const compact = headerRows === COMPACT_HEADER_ROWS;
  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center" marginBottom={HEADER_MARGIN}>
      <Logo compact={compact} />
      <Box flexDirection="column">
        <Counters counters={counters} />
      </Box>
    </Box>
  );
};
