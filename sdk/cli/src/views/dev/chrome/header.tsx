import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { WorkflowSummary } from '#components/workflow_summary.js';

const LOGO_FULL = [
  ' ██████  ██    ██ ████████ ██████  ██    ██ ████████',
  '██    ██ ██    ██    ██    ██   ██ ██    ██    ██   ',
  '██    ██ ██    ██    ██    ██████  ██    ██    ██   ',
  '██    ██ ██    ██    ██    ██      ██    ██    ██   ',
  ' ██████   ██████     ██    ██       ██████     ██   '
];

const FULL_WIDTH_THRESHOLD = 90;

const COLOR_LIGHT = '#c4b5fd';
const COLOR_MEDIUM_LIGHT = '#a78bfa';
const COLOR_MEDIUM = '#8b5cf6';
const COLOR_MEDIUM_DARK = '#7c3aed';
const COLOR_DARK = '#6d28d9';

const FULL_LOGO_ROW_COLORS = [
  COLOR_LIGHT,
  COLOR_MEDIUM_LIGHT,
  COLOR_MEDIUM,
  COLOR_MEDIUM_DARK,
  COLOR_DARK
];

export interface HeaderCounters {
  running: number;
  failed: number;
  totalWorkflows: number;
  totalRuns: number;
  failingServices: number;
}

const Counters: React.FC<{ counters: HeaderCounters }> = ( { counters } ) => (
  <Box flexDirection="row">
    {counters.failingServices > 0 && (
      <Box marginRight={3}>
        <Text color="red" bold>⚠ {counters.failingServices} service{counters.failingServices === 1 ? '' : 's'} down</Text>
      </Box>
    )}
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
    return <Text color={COLOR_MEDIUM_LIGHT} bold>OUTPUT</Text>;
  }
  return (
    <Box flexDirection="column">
      {LOGO_FULL.map( ( line, i ) => (
        <Text key={i} color={FULL_LOGO_ROW_COLORS[i] ?? COLOR_MEDIUM_LIGHT} bold>{line}</Text>
      ) )}
    </Box>
  );
};

export const buildSummaryCounters = (
  summary: WorkflowSummary | null,
  totalWorkflows: number,
  failingServices: number = 0
): HeaderCounters => ( {
  running: summary?.running ?? 0,
  failed: summary?.failed ?? 0,
  totalWorkflows,
  totalRuns: summary?.total ?? 0,
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
