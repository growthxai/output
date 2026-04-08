import React from 'react';
import { Text } from 'ink';

interface StatusDisplay {
  icon: string;
  color: string;
}

const STATUS_MAP: Record<string, StatusDisplay> = {
  // Docker service health
  healthy: { icon: '●', color: 'green' },
  unhealthy: { icon: '○', color: 'red' },
  starting: { icon: '◐', color: 'yellow' },
  none: { icon: '●', color: 'blue' },
  exited: { icon: '✗', color: 'red' },

  // Workflow run status
  running: { icon: '◐', color: 'yellow' },
  completed: { icon: '●', color: 'green' },
  failed: { icon: '✗', color: 'red' },
  canceled: { icon: '○', color: 'gray' },
  terminated: { icon: '✗', color: 'red' },
  timed_out: { icon: '✗', color: 'red' },
  continued: { icon: '↻', color: 'blue' }
};

const DEFAULT_DISPLAY: StatusDisplay = { icon: '?', color: 'white' };

export const resolveStatus = ( status: string ): StatusDisplay =>
  STATUS_MAP[status] ?? DEFAULT_DISPLAY;

export const statusColor = ( status: string ): string =>
  resolveStatus( status ).color;

export const StatusIcon: React.FC<{ status: string }> = ( { status } ) => {
  const { icon, color } = resolveStatus( status );
  return <Text color={color}>{icon}</Text>;
};
