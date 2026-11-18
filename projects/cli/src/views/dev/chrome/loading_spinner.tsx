import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

/**
 * The dim "<spinner> loading…" row used by every panel and modal that
 * waits on async data. Single source of truth so the visual stays
 * uniform.
 */
export const LoadingSpinner: React.FC<{ label?: string }> = ( { label = 'loading…' } ) => (
  <Box>
    <Text color="yellow"><Spinner type="dots" /></Text>
    <Text dimColor> {label}</Text>
  </Box>
);
