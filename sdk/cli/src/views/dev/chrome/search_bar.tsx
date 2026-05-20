import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useUiState } from '#views/dev/state/ui_state.js';

const SEARCH_CONTENT_ROWS = 1;
const SEARCH_BORDER_ROWS = 2;

export const useHeight = (): number => {
  const ui = useUiState();
  return ui.search.open || Boolean( ui.search.query ) ? SEARCH_CONTENT_ROWS + SEARCH_BORDER_ROWS : 0;
};

export const SearchBar: React.FC<{
  active: boolean;
}> = ( { active } ) => {
  const ui = useUiState();
  const visible = useHeight() > 0;

  useInput( ( input, key ) => {
    if ( key.escape ) {
      ui.clearSearch();
      return;
    }
    if ( key.return ) {
      ui.closeSearch();
      return;
    }
    if ( key.backspace || key.delete ) {
      ui.setSearchQuery( ui.search.query.slice( 0, -1 ) );
      return;
    }
    if ( input && !key.ctrl && !key.meta ) {
      ui.setSearchQuery( ui.search.query + input );
    }
  }, { isActive: active } );

  if ( !visible ) {
    return null;
  }

  return (
    <Box borderColor="white" borderStyle="double" flexGrow={1}>
      <Text dimColor>FILTER WORKFLOWS:&nbsp;</Text>
      <Text>{ui.search.query}</Text>
      {active && <Text inverse>{' '}</Text>}
    </Box>
  );
};
