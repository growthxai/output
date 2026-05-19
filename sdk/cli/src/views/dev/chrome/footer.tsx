import React from 'react';
import { Box, Text } from 'ink';
import packageJson from '../../../../package.json' with { type: 'json' };

export const getHeight = (): number => 2;

export interface CommandHint {
  key: string;
  label: string;
}

export interface FooterState {
  hints?: CommandHint[];
  itemCount?: number;
  itemLabel?: string;
}

const GLOBAL_HINTS: CommandHint[] = [
  { key: 'tab', label: 'next tab' },
  { key: 'shift-tab', label: 'prev tab' },
  { key: '1-4', label: 'tabs' },
  { key: '/', label: 'search' },
  { key: '?', label: 'help' },
  { key: 'ctrl+c', label: 'quit' }
];

const VERSION = packageJson.version;

const HintRow: React.FC<{ hints: CommandHint[] }> = ( { hints } ) => (
  <Box flexDirection="row">
    {hints.length === 0 ? (
      <Text> </Text>
    ) : hints.map( ( hint, i ) => (
      <React.Fragment key={hint.key}>
        {i > 0 && <Text dimColor>{'  '}</Text>}
        <Text bold>{hint.key}</Text>
        <Text dimColor>{` ${hint.label}`}</Text>
      </React.Fragment>
    ) )}
  </Box>
);

export const Footer: React.FC<FooterState> = ( { hints = [], itemCount, itemLabel } ) => {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <HintRow hints={GLOBAL_HINTS} />
        {typeof itemCount === 'number' && itemLabel && (
          <Box>
            <Text dimColor>{itemCount} {itemLabel}</Text>
          </Box>
        )}
      </Box>
      <Box flexDirection="row" justifyContent="space-between">
        <HintRow hints={hints} />
        <Text color="blackBright">v{VERSION}</Text>
      </Box>
    </Box>
  );
};
