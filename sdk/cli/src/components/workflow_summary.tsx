import React from 'react';
import { Box, Text } from 'ink';
import { statusColor } from '#components/status_icon.js';

export interface WorkflowSummary {
  running: number;
  completed: number;
  failed: number;
  total: number;
}

export const WorkflowSummarySection: React.FC<{ summary: WorkflowSummary }> = ( { summary } ) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold>📋 Workflows</Text>
    <Box marginTop={1}>
      <Text color={statusColor( 'running' )}>{summary.running} running</Text>
      <Text>, </Text>
      <Text color={statusColor( 'failed' )}>{summary.failed} failed</Text>
      <Text>, </Text>
      <Text color={statusColor( 'completed' )}>{summary.completed} complete</Text>
    </Box>
  </Box>
);
