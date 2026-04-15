import React from 'react';
import { Box, Text } from 'ink';

export interface CommandHint {
  key: string;
  label: string;
}

export const CommandFooter: React.FC<{ hints: CommandHint[] }> = ( { hints } ) => (
  <Box marginTop={1}>
    {hints.map( ( hint, i ) => (
      <React.Fragment key={hint.key}>
        {i > 0 && <Text dimColor>{' | '}</Text>}
        <Text dimColor>{'('}</Text>
        <Text dimColor bold>{hint.key}</Text>
        <Text dimColor>{')'}</Text>
        <Text dimColor>{` ${hint.label}`}</Text>
      </React.Fragment>
    ) )}
  </Box>
);
