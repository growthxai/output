import React from 'react';
import { Text } from 'ink';

/**
 * Theme-agnostic 2-cell selection bar for list rows. When selected, renders
 * inverse-video (SGR 7) — a solid block of the terminal's actual default
 * foreground colour with the arrow visible inside it. When unselected,
 * renders two plain spaces. Inverse is theme-agnostic by design: it never
 * picks a palette slot, just swaps the user's configured fg/bg.
 *
 * Each row using this still owns its own 1-cell separator after the
 * indicator, so the total indicator column is 3 cells wide.
 */
export const SelectionIndicator: React.FC<{ selected: boolean }> = ( { selected } ) => (
  selected ? <Text inverse>{' ▸'}</Text> : <Text>{'  '}</Text>
);
