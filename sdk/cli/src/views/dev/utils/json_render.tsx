import React from 'react';
import { Box, Text } from 'ink';

const RAW_TOKEN_RE = /"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]|\s+/g;

type RawKind = 'string' | 'punct' | 'lit' | 'num' | 'ws';

interface RawToken {
  kind: RawKind;
  text: string;
}

export interface ColoredToken {
  text: string;
  color?: string;
}

const KEY_COLOR = 'cyan';
const STRING_COLOR = 'green';
const NUMBER_COLOR = 'yellow';
const BOOLEAN_COLOR = 'magenta';
const NULL_COLOR = 'red';
const PUNCT_COLOR = 'gray';

const classifyRaw = ( text: string ): RawToken => {
  if ( /^\s+$/.test( text ) ) {
    return { kind: 'ws', text };
  }
  if ( text.startsWith( '"' ) ) {
    return { kind: 'string', text };
  }
  if ( text === 'true' || text === 'false' || text === 'null' ) {
    return { kind: 'lit', text };
  }
  if ( /^-?\d/.test( text ) ) {
    return { kind: 'num', text };
  }
  return { kind: 'punct', text };
};

export const tokenizeLine = ( line: string ): ColoredToken[] => {
  const raws: RawToken[] = Array.from( line.matchAll( RAW_TOKEN_RE ), m => classifyRaw( m[0] ) );

  return raws.map( ( raw, idx ) => {
    if ( raw.kind === 'ws' ) {
      return { text: raw.text };
    }
    if ( raw.kind === 'string' ) {
      const next = raws.slice( idx + 1 ).find( r => r.kind !== 'ws' );
      const isKey = next?.kind === 'punct' && next.text === ':';
      return { text: raw.text, color: isKey ? KEY_COLOR : STRING_COLOR };
    }
    if ( raw.kind === 'lit' ) {
      return { text: raw.text, color: raw.text === 'null' ? NULL_COLOR : BOOLEAN_COLOR };
    }
    if ( raw.kind === 'num' ) {
      return { text: raw.text, color: NUMBER_COLOR };
    }
    return { text: raw.text, color: PUNCT_COLOR };
  } );
};

export const formatJsonText = ( value: unknown ): string => {
  if ( value === undefined || value === null ) {
    return '';
  }
  try {
    return JSON.stringify( value, null, 2 );
  } catch {
    return String( value );
  }
};

const renderTokens = ( tokens: ColoredToken[] ): React.ReactNode =>
  tokens.map( ( token, i ) =>
    token.color ?
      <Text key={i} color={token.color}>{token.text}</Text> :
      <Text key={i}>{token.text}</Text>
  );

export const countJsonLines = ( value: unknown ): number => {
  const text = formatJsonText( value );
  return text ? text.split( '\n' ).length : 0;
};

export const JsonView: React.FC<{
  value: unknown;
  maxLines?: number;
  offset?: number;
  truncateLine?: boolean;
  showOverflowFooter?: boolean;
}> = ( { value, maxLines, offset = 0, truncateLine = true, showOverflowFooter = true } ) => {
  if ( value === undefined || value === null ) {
    return <Text dimColor>—</Text>;
  }

  const text = formatJsonText( value );
  if ( !text ) {
    return <Text dimColor>—</Text>;
  }

  const allLines = text.split( '\n' );
  const start = Math.max( 0, offset );
  const end = typeof maxLines === 'number' ? start + maxLines : undefined;
  const visible = allLines.slice( start, end );
  const overflowBelow = end !== undefined ? Math.max( 0, allLines.length - end ) : 0;

  return (
    <Box flexDirection="column">
      {visible.map( ( line, i ) => (
        <Text key={i} wrap={truncateLine ? 'truncate-end' : 'wrap'}>
          {renderTokens( tokenizeLine( line ) )}
        </Text>
      ) )}
      {showOverflowFooter && overflowBelow > 0 && (
        <Text dimColor>… {overflowBelow} more line{overflowBelow === 1 ? '' : 's'}</Text>
      )}
    </Box>
  );
};
