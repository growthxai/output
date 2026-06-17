import React from 'react';
import { Text } from 'ink';

interface StatusDisplay {
  icon: string;
  color: string;
}

const WORKFLOW_STATUS_MAP: Record<string, StatusDisplay> = {
  running: { icon: '●', color: 'yellow' },
  completed: { icon: '●', color: 'green' },
  failed: { icon: '✗', color: 'red' },
  canceled: { icon: '○', color: 'gray' },
  terminated: { icon: '✗', color: 'gray' },
  timed_out: { icon: '✗', color: 'red' },
  continued_as_new: { icon: '↻', color: 'blue' }
};

const DEFAULT_DISPLAY: StatusDisplay = { icon: '?', color: 'white' };

export const resolveWorkflowStatus = ( status: string ): StatusDisplay =>
  WORKFLOW_STATUS_MAP[status] ?? DEFAULT_DISPLAY;

export const workflowStatusColor = ( status: string ): string =>
  resolveWorkflowStatus( status ).color;

/** Renders workflow, run, and step status without Docker status semantics. */
export const WorkflowStatusIcon: React.FC<{ status: string }> = ( { status } ) => {
  const { icon, color } = resolveWorkflowStatus( status );
  return <Text color={color}>{icon}</Text>;
};
