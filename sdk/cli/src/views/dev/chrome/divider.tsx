import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { RULE_PURPLE } from '#views/dev/chrome/palette.js';

const DEFAULT_RULE_COLOR = RULE_PURPLE;
const DEFAULT_VRULE_COLOR = 'gray';

// dev_app.tsx Shell uses paddingX={2}, so 4 cols are eaten by horizontal padding.
const SHELL_HORIZONTAL_PADDING = 4;

export const HorizontalRule: React.FC<{ color?: string; widthOffset?: number }> = (
  { color = DEFAULT_RULE_COLOR, widthOffset = SHELL_HORIZONTAL_PADDING }
) => {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  return <Text color={color}>{'─'.repeat( Math.max( 1, cols - widthOffset ) )}</Text>;
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
