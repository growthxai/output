import React from 'react';
import { Box, Text } from 'ink';
import { TAB_LABELS, TAB_ORDER, type Tab } from '#views/dev/state/ui_state.js';

export const TabBar: React.FC<{ active: Tab }> = ( { active } ) => (
  <Box flexDirection="row" marginTop={1}>
    {TAB_ORDER.map( tab => (
      <Box key={tab} marginRight={3}>
        {tab === active ? (
          <Text inverse bold>{` ${TAB_LABELS[tab]} `}</Text>
        ) : (
          <Text dimColor>{TAB_LABELS[tab]}</Text>
        )}
      </Box>
    ) )}
  </Box>
);
