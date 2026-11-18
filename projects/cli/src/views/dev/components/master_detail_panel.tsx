import React from 'react';
import { Box, Text } from 'ink';
import { computeWindowStart } from '#views/dev/utils/panel_helpers.js';

interface DetailRenderInfo {
  detailRows: number;
}

/**
 * Generic two-pane shell shared by every panel that has a windowed list
 * on top and a detail pane below. Panels keep their own selection state
 * and detail rendering; the shell owns the layout invariant (windowing,
 * overflow indicators, separator) so it lives in one place.
 */
export interface MasterDetailPanelProps<T> {
  items: T[];
  selectedIndex: number;
  height?: number;
  visibleRows: number;
  renderHeader: () => React.ReactNode;
  renderRow: ( item: T, selected: boolean, absoluteIndex: number ) => React.ReactNode;
  rowKey: ( item: T, absoluteIndex: number ) => string;
  detail: React.ReactNode | ( ( info: DetailRenderInfo ) => React.ReactNode );
}

const HEADER_ROWS = 1;
const DETAIL_BORDER_ROWS = 2;

const OverflowIndicator: React.FC<{ direction: 'up' | 'down'; count: number }> = ( { direction, count } ) => (
  <Text dimColor>  {direction === 'up' ? '↑' : '↓'} {count} more {direction === 'up' ? 'above' : 'below'}</Text>
);

export const MasterDetailPanel = <T extends object>( props: MasterDetailPanelProps<T> ): React.ReactElement => {
  const { items, selectedIndex, height, visibleRows, renderHeader, renderRow, rowKey, detail } = props;
  const windowStart = computeWindowStart( selectedIndex, items.length, visibleRows );
  const visible = items.slice( windowStart, windowStart + visibleRows );
  const overflowAbove = windowStart;
  const overflowBelow = items.length - ( windowStart + visible.length );
  const listRows = HEADER_ROWS + visible.length + ( overflowAbove > 0 ? 1 : 0 ) + ( overflowBelow > 0 ? 1 : 0 );
  const detailRows = Math.max( 1, ( height ?? 1 ) - listRows - DETAIL_BORDER_ROWS );
  const renderedDetail = typeof detail === 'function' ? detail( { detailRows } ) : detail;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" flexShrink={0}>
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
      <Box borderStyle="single" borderColor="blackBright" paddingX={1} flexGrow={1}>
        {renderedDetail}
      </Box>
    </Box>
  );
};
