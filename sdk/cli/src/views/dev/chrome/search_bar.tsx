import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useUiState } from '#views/dev/state/ui_state.js';

export const SearchBar: React.FC<{
  active: boolean;
  onSubmit?: ( query: string ) => void;
}> = ( { active, onSubmit } ) => {
  const ui = useUiState();

  useInput( ( input, key ) => {
    if ( key.escape ) {
      ui.clearSearch();
      return;
    }
    if ( key.return ) {
      onSubmit?.( ui.search.query );
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

  useEffect( () => {
    if ( !active ) {
      return;
    }
    onSubmit?.( ui.search.query );
  }, [ active, ui.search.query, onSubmit ] );

  if ( !active ) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text bold>/ </Text>
      <Text>{ui.search.query}</Text>
      <Text inverse>{' '}</Text>
    </Box>
  );
};
