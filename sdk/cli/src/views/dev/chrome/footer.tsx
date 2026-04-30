import React from 'react';
import { Box, Text } from 'ink';

export interface CommandHint {
  key: string;
  label: string;
}

export const Footer: React.FC<{
  hints: CommandHint[];
  itemCount?: number;
  itemLabel?: string;
}> = ( { hints, itemCount, itemLabel = 'items' } ) => (
  <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
    <Box flexDirection="row">
      {hints.map( ( hint, i ) => (
        <React.Fragment key={hint.key}>
          {i > 0 && <Text dimColor>{'  '}</Text>}
          <Text bold>{hint.key}</Text>
          <Text dimColor>{` ${hint.label}`}</Text>
        </React.Fragment>
      ) )}
    </Box>
    {typeof itemCount === 'number' && (
      <Box>
        <Text dimColor>{itemCount} {itemLabel}</Text>
      </Box>
    )}
  </Box>
);

export const GLOBAL_HINTS: CommandHint[] = [
  { key: 'tab', label: 'next tab' },
  { key: '/', label: 'search' },
  { key: '?', label: 'help' },
  { key: 'ctrl+c', label: 'quit' }
];
