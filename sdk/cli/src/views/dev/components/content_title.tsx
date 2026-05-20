import React from 'react';
import { Box, Text } from 'ink';

const TITLE_ROWS = 1;
const TITLE_MARGIN_BOTTOM = 1;

export const getHeight = (): number => TITLE_ROWS + TITLE_MARGIN_BOTTOM;

/** Renders a bold title for panel content sections. */
export const ContentTitle: React.FC<{ title: string }> = ( { title } ) => (
  <Box marginBottom={TITLE_MARGIN_BOTTOM}>
    <Text bold>{title}</Text>
  </Box>
);
