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
  ' ██████  ██    ██ ████████ ██████  ██    ██ ████████',
  '██    ██ ██    ██    ██    ██   ██ ██    ██    ██   ',
  '██    ██ ██    ██    ██    ██████  ██    ██    ██   ',
  '██    ██ ██    ██    ██    ██      ██    ██    ██   ',
  ' ██████   ██████     ██    ██       ██████     ██   '
];

const QUADRANT_CHARS = [
  ' ', '▗', '▖', '▄',
  '▝', '▐', '▞', '▟',
  '▘', '▚', '▌', '▙',
  '▀', '▜', '▛', '█'
];

export const compressPixels = ( rows: string[] ): string[] => {
  const maxCol = Math.max( ...rows.map( r => r.length ) );
  const evenCol = maxCol + ( maxCol % 2 );
  const padded = rows.map( r => r.padEnd( evenCol, ' ' ) );
  const fullPadded = padded.length % 2 === 1 ?
    [ ...padded, ' '.repeat( evenCol ) ] :
    padded;

  const rowPairs = fullPadded.reduce<Array<[string, string]>>( ( acc, row, i ) => {
    if ( i % 2 === 0 ) {
      acc.push( [ row, fullPadded[i + 1] ] );
    }
    return acc;
  }, [] );

  const colCount = Math.floor( evenCol / 2 );

  return rowPairs.map( ( [ top, bot ] ) => {
    const chars = Array.from( { length: colCount }, ( _, k ) => {
      const j = k * 2;
      const tl = top[j] === '█' ? 8 : 0;
      const tr = top[j + 1] === '█' ? 4 : 0;
      const bl = bot[j] === '█' ? 2 : 0;
      const br = bot[j + 1] === '█' ? 1 : 0;
      return QUADRANT_CHARS[tl + tr + bl + br];
    } );
    return chars.join( '' );
  } );
};

const LOGO_COMPRESSED = compressPixels( LOGO_PIXELS );

const FULL_WIDTH_THRESHOLD = 60;

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

const Logo: React.FC<{ cols: number }> = ( { cols } ) => {
  if ( cols < FULL_WIDTH_THRESHOLD ) {
    return <Text color={PURPLE_100} bold>OUTPUT</Text>;
  }
  return (
    <Box flexDirection="column">
      {LOGO_COMPRESSED.map( ( line, i ) => (
        <Text key={i} color={LOGO_GRADIENT[i] ?? PURPLE_100} bold>{line}</Text>
      ) )}
    </Box>
  );
};

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
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 120;
  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="flex-start">
      <Logo cols={cols} />
      <Box flexDirection="column" paddingTop={1}>
        <Counters counters={counters} />
      </Box>
    </Box>
  );
};
