import React from 'react';
import { Box, Text } from 'ink';
import { TAB_LABELS, TAB_ORDER, type Tab } from '#views/dev/state/ui_state.js';

export const getHeight = (): number => 2;

export interface TabBarItem {
  id: string;
  label: string;
}

const DEFAULT_ITEMS: TabBarItem[] = TAB_ORDER.map( tab => ( {
  id: tab,
  label: TAB_LABELS[tab]
} ) );

export const TabBar: React.FC<{
  active: Tab | string;
  items?: readonly TabBarItem[];
  borderColor?: string;
}> = ( {
  active,
  items = DEFAULT_ITEMS,
  borderColor
} ) => (
  <Box
    flexDirection="row"
    borderStyle="single"
    borderTop={false}
    borderLeft={false}
    borderRight={false}
    borderBottom={true}
    borderColor={borderColor ?? 'blackBright'}
  >
    {items.map( tab => {
      const activeTab = tab.id === active;
      const content = <>&nbsp;{tab.label}&nbsp;</>;
      if ( activeTab ) {
        return (
          <Box key={tab.id} marginRight={3}>
            <Text inverse bold>{content}</Text>
          </Box>
        );
      }
      return (
        <Box key={tab.id} marginRight={3}>
          <Text dimColor>{content}</Text>
        </Box>
      );
    } )}
  </Box>
);
