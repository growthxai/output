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
  const matches = Array.from( line.matchAll( RAW_TOKEN_RE ) );
  const matchedRaws = matches.flatMap<RawToken>( ( match, idx ) => {
    const index = match.index ?? 0;
    const previous = matches[idx - 1];
    const previousEnd = previous ? ( previous.index ?? 0 ) + previous[0].length : 0;
    const gap = index > previousEnd ? [ { kind: 'string' as const, text: line.slice( previousEnd, index ) } ] : [];
    return [ ...gap, classifyRaw( match[0] ) ];
  } );
  const lastMatch = matches[matches.length - 1];
  const lastIndex = lastMatch ? ( lastMatch.index ?? 0 ) + lastMatch[0].length : 0;
  const raws = lastIndex < line.length ?
    [ ...matchedRaws, { kind: 'string' as const, text: line.slice( lastIndex ) } ] :
    matchedRaws;

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

const tokenLength = ( tokens: ColoredToken[] ): number =>
  tokens.reduce( ( total, token ) => total + token.text.length, 0 );

export const countJsonLines = ( value: unknown ): number => {
  const text = formatJsonText( value );
  return text ? text.split( '\n' ).length : 0;
};

export const wrapTokens = ( tokens: ColoredToken[], maxWidth: number | undefined ): ColoredToken[][] => {
  if ( maxWidth === undefined || maxWidth <= 0 || tokenLength( tokens ) <= maxWidth ) {
    return [ tokens ];
  }

  const state = tokens.reduce<{
    lines: ColoredToken[][];
    current: ColoredToken[];
    width: number;
  }>( ( acc, token ) => {
    const chunks = Array.from(
      { length: Math.ceil( token.text.length / maxWidth ) },
      ( _, i ) => token.text.slice( i * maxWidth, ( i + 1 ) * maxWidth )
    );

    return chunks.reduce( ( chunkAcc, chunk ) => {
      if ( chunkAcc.width > 0 && chunkAcc.width + chunk.length > maxWidth ) {
        return {
          lines: [ ...chunkAcc.lines, chunkAcc.current ],
          current: [ { ...token, text: chunk } ],
          width: chunk.length
        };
      }
      return {
        ...chunkAcc,
        current: [ ...chunkAcc.current, { ...token, text: chunk } ],
        width: chunkAcc.width + chunk.length
      };
    }, acc );
  }, { lines: [], current: [], width: 0 } );

  return state.current.length > 0 ? [ ...state.lines, state.current ] : state.lines;
};

export const JsonView: React.FC<{
  value: unknown;
  maxLines?: number;
  offset?: number;
  truncateLine?: boolean;
  showOverflowFooter?: boolean;
  maxWidth?: number;
}> = ( { value, maxLines, offset = 0, truncateLine = true, showOverflowFooter = true, maxWidth } ) => {
  if ( value === undefined || value === null ) {
    return <Text dimColor>—</Text>;
  }

  const text = formatJsonText( value );
  if ( !text ) {
    return <Text dimColor>—</Text>;
  }

  const allLines = text.split( '\n' );
  const start = Math.max( 0, offset );
  const displayLines = allLines
    .slice( start )
    .flatMap( line => truncateLine ? [ tokenizeLine( line ) ] : wrapTokens( tokenizeLine( line ), maxWidth ) );
  const hasLineLimit = typeof maxLines === 'number';
  const overflowBelow = hasLineLimit ? Math.max( 0, displayLines.length - maxLines ) : 0;
  const footerRows = showOverflowFooter && overflowBelow > 0 ? 1 : 0;
  const end = hasLineLimit ? Math.max( 0, maxLines - footerRows ) : undefined;
  const visible = displayLines.slice( 0, end );
  const omittedLines = hasLineLimit ? Math.max( 0, displayLines.length - visible.length ) : 0;

  return (
    <Box flexDirection="column">
      {visible.map( ( tokens, i ) => (
        <Text key={i} wrap={truncateLine ? 'truncate-end' : 'wrap'}>
          {renderTokens( tokens )}
        </Text>
      ) )}
      {showOverflowFooter && omittedLines > 0 && (
        <Text dimColor>… {omittedLines} more line{omittedLines === 1 ? '' : 's'}</Text>
      )}
    </Box>
  );
};
