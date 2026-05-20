import React from 'react';
import { Box, Text } from 'ink';
import { RULE_PURPLE } from '#views/dev/chrome/palette.js';

const FRAME_BORDER_ROWS = 2;
const FRAME_TITLE_ROWS = 1;
const FRAME_FOOTER_ROWS = 1;
const FRAME_GAP_ROWS = 2;

export const getHeight = (): number =>
  FRAME_BORDER_ROWS + FRAME_TITLE_ROWS + FRAME_FOOTER_ROWS + FRAME_GAP_ROWS;

export type ModalShortcut = readonly [ key: string, label: string ] | {
  key: string;
  label: string;
};

const isShortcutTuple = ( shortcut: ModalShortcut ): shortcut is readonly [ string, string ] =>
  Array.isArray( shortcut );

const shortcutKey = ( shortcut: ModalShortcut ): string =>
  isShortcutTuple( shortcut ) ? shortcut[0] : shortcut.key;

const shortcutLabel = ( shortcut: ModalShortcut ): string =>
  isShortcutTuple( shortcut ) ? shortcut[1] : shortcut.label;

const ModalShortcutList: React.FC<{ shortcuts: readonly ModalShortcut[] }> = ( { shortcuts } ) => (
  <Box columnGap={2}>
    {shortcuts.map( shortcut => (
      <Box key={shortcutKey( shortcut )} columnGap={1}>
        <Text bold>{shortcutKey( shortcut )}</Text>
        <Text dimColor>{shortcutLabel( shortcut )}</Text>
      </Box>
    ) )}
  </Box>
);

export const ModalFrame: React.FC<{
  title: string;
  titleRight?: React.ReactNode;
  footer?: React.ReactNode;
  shortcuts?: readonly ModalShortcut[];
  children: React.ReactNode;
}> = ( { title, titleRight, footer, shortcuts, children } ) => (
  <Box flexDirection="column" borderStyle="round" borderColor={RULE_PURPLE} paddingX={1} gap={1}>
    <Box justifyContent="space-between">
      <Text bold>{title}</Text>
      {titleRight}
    </Box>
    <Box flexDirection="column">
      {children}
    </Box>
    {shortcuts && shortcuts.length > 0 ? <ModalShortcutList shortcuts={shortcuts} /> : footer}
  </Box>
);
