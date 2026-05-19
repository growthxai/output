import React from 'react';
import { Box, Text } from 'ink';

export const getHeight = (): number => 2;

/** Renders a bold title for panel content sections. */
export const ContentTitle: React.FC<{ title: string }> = ( { title } ) => (
  <Box marginBottom={1}>
    <Text bold>{title}</Text>
  </Box>
);
