import React from 'react';
import { Box, Text } from 'ink';
import type { WorkflowRun } from '#services/workflow_runs.js';
import { WorkflowStatusIcon, workflowStatusColor } from '#views/dev/components/workflow_status.js';
import { elapsedMs, formatDate, formatDurationCompact } from '#utils/date_formatter.js';

const SidebarKV: React.FC<{ label: string; value: string; }> = ( { label, value } ) => (
  <Box flexDirection="row">
    <Text dimColor bold>{label}:&nbsp;</Text>
    <Text bold wrap="wrap">{value}</Text>
  </Box>
);

export const RunInfoSidebar: React.FC<{
  run: WorkflowRun;
  resultStatus?: string | null;
  maxRows?: number;
}> = ( { run, resultStatus, maxRows } ) => {
  const status = resultStatus ?? run.status ?? 'unknown';
  const duration = run.startedAt ? formatDurationCompact( elapsedMs( run.startedAt, run.completedAt ) ) : '-';
  const rows = [
    <Box key="status">
      <Text dimColor>RUN STATUS&nbsp;</Text>
      <WorkflowStatusIcon status={status} />
      <Text>&nbsp;</Text>
      <Text bold color={workflowStatusColor( status )}>{status.toUpperCase()}</Text>
    </Box>,
    <SidebarKV key="run-id" label="RUN ID" value={run.runId ?? '-'} />,
    <SidebarKV key="workflow-id" label="WORKFLOW ID" value={run.workflowId} />,
    <SidebarKV key="type" label="TYPE" value={run.workflowType ?? '-'} />,
    <SidebarKV key="duration" label="DURATION" value={duration} />,
    <SidebarKV key="start" label="START" value={formatDate( run.startedAt )} />,
    <SidebarKV key="end" label="END" value={run.completedAt ? formatDate( run.completedAt ) : ''} />
  ];

  return (
    <Box flexDirection="column" gap={maxRows === undefined ? 1 : 0}>
      {rows.slice( 0, maxRows )}
    </Box>
  );
};
