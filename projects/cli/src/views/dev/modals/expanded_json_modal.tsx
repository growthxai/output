import React, { useState } from 'react';
import { Text, useInput, useStdout } from 'ink';
import { useUiState } from '#views/dev/state/ui_state.js';
import { JsonView, countJsonLines } from '#views/dev/utils/json_render.js';
import { ModalFrame } from '#views/dev/modals/modal_frame.js';

const CHROME_HEIGHT = 6;
const FALLBACK_ROWS = 24;
const PAGE_SIZE = 10;

export const ExpandedJsonModal: React.FC = () => {
  const ui = useUiState();
  const { stdout } = useStdout();
  const [ offset, setOffset ] = useState( 0 );

  const { value, title } = ui.expandedJson;
  const totalLines = countJsonLines( value );
  const rows = stdout?.rows ?? FALLBACK_ROWS;
  const visibleLines = Math.max( 5, rows - CHROME_HEIGHT );
  const maxOffset = Math.max( 0, totalLines - visibleLines );
  const clampedOffset = Math.min( offset, maxOffset );

  useInput( ( input, key ) => {
    if ( key.escape ) {
      ui.closeExpandedJson();
      return;
    }
    if ( key.downArrow ) {
      setOffset( o => Math.min( maxOffset, o + 1 ) );
      return;
    }
    if ( key.upArrow ) {
      setOffset( o => Math.max( 0, o - 1 ) );
      return;
    }
    if ( key.pageDown ) {
      setOffset( o => Math.min( maxOffset, o + PAGE_SIZE ) );
      return;
    }
    if ( key.pageUp ) {
      setOffset( o => Math.max( 0, o - PAGE_SIZE ) );
    }
  } );

  const progress = totalLines === 0 ? 100 : Math.round( ( ( clampedOffset + visibleLines ) / totalLines ) * 100 );

  return (
    <ModalFrame
      title={title}
      titleRight={(
        <Text dimColor>
          {Math.min( 100, progress )}%   line {clampedOffset + 1}-{Math.min( totalLines, clampedOffset + visibleLines )}/{totalLines}
        </Text>
      )}
      shortcuts={[ [ '↑/↓', 'scroll' ], [ 'pgup/pgdn', 'page' ], [ 'esc', 'close' ] ]}
    >
      <JsonView value={value} maxLines={visibleLines} offset={clampedOffset} truncateLine showOverflowFooter={false} />
    </ModalFrame>
  );
};
