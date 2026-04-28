import React from 'react';
import { Box, Text, useStdout } from 'ink';

const DEFAULT_RULE_COLOR = '#a78bfa';
const DEFAULT_VRULE_COLOR = 'gray';

export const HorizontalRule: React.FC<{ color?: string }> = ( { color = DEFAULT_RULE_COLOR } ) => {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  return <Text color={color}>{'─'.repeat( Math.max( 1, cols ) )}</Text>;
};

export const VerticalRule: React.FC<{ color?: string }> = ( { color = DEFAULT_VRULE_COLOR } ) => (
  <Box
    borderStyle="single"
    borderColor={color}
    borderTop={false}
    borderBottom={false}
    borderRight={false}
    flexDirection="column"
  />
);
