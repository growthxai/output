import React from 'react';
import { Box, Text } from 'ink';
import { Footer, type CommandHint } from '#views/dev/chrome/footer.js';
import { HorizontalRule } from '#views/dev/chrome/divider.js';
import { computeWindowStart } from '#views/dev/utils/panel_helpers.js';

/**
 * Generic two-pane shell shared by every panel that has a windowed list
 * on top, a horizontal rule, a detail pane below, and a footer at the
 * bottom. Panels keep their own selection state and detail rendering;
 * the shell owns the layout invariant (windowing, overflow indicators,
 * separator, footer) so it lives in one place.
 */
export interface MasterDetailPanelProps<T> {
  items: T[];
  selectedIndex: number;
  visibleRows: number;
  renderHeader: () => React.ReactNode;
  renderRow: ( item: T, selected: boolean, absoluteIndex: number ) => React.ReactNode;
  rowKey: ( item: T, absoluteIndex: number ) => string;
  detail: React.ReactNode;
  hints: CommandHint[];
  itemLabel: string;
}

const OverflowIndicator: React.FC<{ direction: 'up' | 'down'; count: number }> = ( { direction, count } ) => (
  <Text dimColor>  {direction === 'up' ? '↑' : '↓'} {count} more {direction === 'up' ? 'above' : 'below'}</Text>
);

export const MasterDetailPanel = <T extends object>( props: MasterDetailPanelProps<T> ): React.ReactElement => {
  const { items, selectedIndex, visibleRows, renderHeader, renderRow, rowKey, detail, hints, itemLabel } = props;
  const windowStart = computeWindowStart( selectedIndex, items.length, visibleRows );
  const visible = items.slice( windowStart, windowStart + visibleRows );
  const overflowAbove = windowStart;
  const overflowBelow = items.length - ( windowStart + visible.length );

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="column">
        {renderHeader()}
        {overflowAbove > 0 && <OverflowIndicator direction="up" count={overflowAbove} />}
        {visible.map( ( item, i ) => {
          const absoluteIndex = windowStart + i;
          return (
            <React.Fragment key={rowKey( item, absoluteIndex )}>
              {renderRow( item, absoluteIndex === selectedIndex, absoluteIndex )}
            </React.Fragment>
          );
        } )}
        {overflowBelow > 0 && <OverflowIndicator direction="down" count={overflowBelow} />}
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <HorizontalRule />
      </Box>
      {detail}
      <Footer hints={hints} itemCount={items.length} itemLabel={itemLabel} />
    </Box>
  );
};
