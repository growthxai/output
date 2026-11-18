import React from 'react';
import { Text } from 'ink';

interface StatusDisplay {
  icon: string;
  color: string;
}

const DOCKER_SERVICE_STATUS_MAP: Record<string, StatusDisplay> = {
  healthy: { icon: '●', color: 'green' },
  unhealthy: { icon: '○', color: 'red' },
  starting: { icon: '◐', color: 'yellow' },
  none: { icon: '●', color: 'blue' },
  running: { icon: '●', color: 'green' },
  created: { icon: '◐', color: 'yellow' },
  exited: { icon: '✗', color: 'red' }
};

const DEFAULT_DISPLAY: StatusDisplay = { icon: '?', color: 'white' };

export const resolveDockerServiceStatus = ( status: string ): StatusDisplay =>
  DOCKER_SERVICE_STATUS_MAP[status] ?? DEFAULT_DISPLAY;

export const dockerServiceStatusColor = ( status: string ): string =>
  resolveDockerServiceStatus( status ).color;

/** Renders Docker service health/state without workflow status semantics. */
export const DockerServiceStatusIcon: React.FC<{ status: string }> = ( { status } ) => {
  const { icon, color } = resolveDockerServiceStatus( status );
  return <Text color={color}>{icon}</Text>;
};
