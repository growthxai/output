import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useUiState, type Toast } from '#views/dev/state/ui_state.js';

const TOAST_TTL_MS = 4000;

export const useHeight = (): number => {
  const ui = useUiState();
  return ui.toasts.length > 0 ? ui.toasts.length + 1 : 0;
};

const toneColor = ( tone: Toast['tone'] ): string => {
  if ( tone === 'success' ) {
    return 'green';
  }
  if ( tone === 'error' ) {
    return 'red';
  }
  return 'cyan';
};

const tonePrefix = ( tone: Toast['tone'] ): string => {
  if ( tone === 'success' ) {
    return '✓';
  }
  if ( tone === 'error' ) {
    return '✗';
  }
  return 'ℹ';
};

export const Toasts: React.FC = () => {
  const ui = useUiState();
  const dismissToast = ui.dismissToast;
  const toasts = ui.toasts;

  useEffect( () => {
    const timers = toasts.map( toast => setTimeout( () => dismissToast( toast.id ), TOAST_TTL_MS ) );
    return () => {
      for ( const t of timers ) {
        clearTimeout( t );
      }
    };
  }, [ toasts, dismissToast ] );

  if ( toasts.length === 0 ) {
    return null;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {toasts.map( toast => (
        <Box key={toast.id}>
          <Text color={toneColor( toast.tone )}>{tonePrefix( toast.tone )} {toast.message}</Text>
        </Box>
      ) )}
    </Box>
  );
};
