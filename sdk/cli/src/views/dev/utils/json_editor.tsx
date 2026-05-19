import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface CursorPos {
  line: number;
  col: number;
}

export const cursorToPosition = ( buffer: string, cursor: number ): CursorPos => {
  const before = buffer.slice( 0, cursor );
  const lines = before.split( '\n' );
  return { line: lines.length - 1, col: lines[lines.length - 1].length };
};

export const positionToCursor = ( buffer: string, line: number, col: number ): number => {
  const allLines = buffer.split( '\n' );
  const targetLine = Math.max( 0, Math.min( line, allLines.length - 1 ) );
  const targetCol = Math.max( 0, Math.min( col, allLines[targetLine].length ) );
  const charsBefore = allLines.slice( 0, targetLine ).reduce( ( acc, l ) => acc + l.length + 1, 0 );
  return charsBefore + targetCol;
};

export const tryParseJson = ( text: string ): { ok: true } | { ok: false; error: string } => {
  if ( text.trim().length === 0 ) {
    return { ok: false, error: 'Empty' };
  }
  try {
    JSON.parse( text );
    return { ok: true };
  } catch ( err ) {
    return { ok: false, error: err instanceof Error ? err.message : String( err ) };
  }
};

const VISIBLE_BUFFER = 6;

export const JsonEditor: React.FC<{
  seed: unknown;
  title: string;
  isActive?: boolean;
  onSubmit: ( value: unknown ) => void;
  onCancel: () => void;
}> = ( { seed, title, isActive = true, onSubmit, onCancel } ) => {
  const initial = JSON.stringify( seed ?? {}, null, 2 );
  const [ buffer, setBuffer ] = useState( initial );
  const [ cursor, setCursor ] = useState( initial.length );
  const [ status, setStatus ] = useState<{ ok: true } | { ok: false; error: string }>( () => tryParseJson( initial ) );
  const [ submitMessage, setSubmitMessage ] = useState<string | null>( null );

  useEffect( () => {
    setStatus( tryParseJson( buffer ) );
  }, [ buffer ] );

  const insert = ( text: string ): void => {
    setBuffer( b => b.slice( 0, cursor ) + text + b.slice( cursor ) );
    setCursor( c => c + text.length );
  };

  const removeBeforeCursor = (): void => {
    if ( cursor === 0 ) {
      return;
    }
    setBuffer( b => b.slice( 0, cursor - 1 ) + b.slice( cursor ) );
    setCursor( c => Math.max( 0, c - 1 ) );
  };

  useInput( ( input, key ) => {
    if ( key.escape ) {
      onCancel();
      return;
    }
    if ( key.ctrl && input === 's' ) {
      const parsed = tryParseJson( buffer );
      if ( !parsed.ok ) {
        setSubmitMessage( `Cannot submit — ${parsed.error}` );
        return;
      }
      try {
        onSubmit( JSON.parse( buffer ) );
      } catch ( err ) {
        setSubmitMessage( err instanceof Error ? err.message : String( err ) );
      }
      return;
    }
    if ( key.return ) {
      insert( '\n' );
      return;
    }
    if ( key.tab ) {
      insert( '  ' );
      return;
    }
    if ( key.backspace || key.delete ) {
      removeBeforeCursor();
      return;
    }
    if ( key.leftArrow ) {
      setCursor( c => Math.max( 0, c - 1 ) );
      return;
    }
    if ( key.rightArrow ) {
      setCursor( c => Math.min( buffer.length, c + 1 ) );
      return;
    }
    if ( key.upArrow ) {
      const pos = cursorToPosition( buffer, cursor );
      setCursor( positionToCursor( buffer, pos.line - 1, pos.col ) );
      return;
    }
    if ( key.downArrow ) {
      const pos = cursorToPosition( buffer, cursor );
      setCursor( positionToCursor( buffer, pos.line + 1, pos.col ) );
      return;
    }
    if ( input && !key.ctrl && !key.meta ) {
      insert( input );
    }
  }, { isActive } );

  const lines = buffer.split( '\n' );
  const cursorPos = cursorToPosition( buffer, cursor );
  const half = Math.floor( VISIBLE_BUFFER / 2 );
  const startLine = Math.max( 0, cursorPos.line - half );
  const visibleLines = lines.slice( startLine, startLine + ( VISIBLE_BUFFER * 2 ) + 1 );

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text>File: {title}</Text>
        <Text bold color={status.ok ? 'green' : 'red'}>{status.ok ? '✓ valid JSON' : '✗ invalid JSON'}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {visibleLines.map( ( line, i ) => {
          const lineIdx = startLine + i;
          if ( lineIdx !== cursorPos.line ) {
            return <Text dimColor key={lineIdx}>{line.length === 0 ? ' ' : line}</Text>;
          }
          const before = line.slice( 0, cursorPos.col );
          const at = line[cursorPos.col] ?? ' ';
          const after = line.slice( cursorPos.col + 1 );
          return (
            <Text bold key={lineIdx}>
              <Text>{before}</Text>
              <Text inverse>{at}</Text>
              <Text>{after}</Text>
            </Text>
          );
        } )}
      </Box>

      {!status.ok && (
        <Box marginTop={1}>
          <Text color="red" wrap="truncate-end">{status.error}</Text>
        </Box>
      )}
      {submitMessage && (
        <Box marginTop={1}>
          <Text color="yellow">{submitMessage}</Text>
        </Box>
      )}

      <Box marginTop={1} columnGap={2}>
        <Box columnGap={1}><Text bold>ctrl+s</Text><Text dimColor>submit</Text></Box>
        <Box columnGap={1}><Text bold>esc</Text><Text dimColor>cancel</Text></Box>
        <Box columnGap={1}><Text bold>↑↓←→</Text><Text dimColor>move</Text></Box>
        <Box columnGap={1}><Text bold>tab</Text><Text dimColor>indent</Text></Box>
      </Box>
    </Box>
  );
};
