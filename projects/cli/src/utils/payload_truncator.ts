const MAX_VALUE_DEPTH = 10;
const MAX_STRING_LENGTH = 1024;
const HEAD_LENGTH = 1000;
const TAIL_LENGTH = 24;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 50;
const MAX_VISITED_VALUES = 1000;
const MAX_STACK_LINES = 10;
// Extra characters segmented around a cut so the cluster at the boundary is seen whole
const SEGMENT_WINDOW = 64;

const Marker = {
  maxDepth: '[Maximum Depth Reached]',
  maxKeys: '[Maximum Object Properties Reached]',
  maxValues: '[Serialization Limit Reached]'
};

const segmenter = new Intl.Segmenter( undefined, { granularity: 'grapheme' } );

/** The longest prefix of at most `HEAD_LENGTH` characters that does not end inside a grapheme cluster */
const sliceHead = ( value: string ): string => {
  const ends = [ ...segmenter.segment( value.slice( 0, HEAD_LENGTH + SEGMENT_WINDOW ) ) ].map( ( { index, segment } ) => index + segment.length );
  return value.slice( 0, Math.max( 0, ...ends.filter( end => end <= HEAD_LENGTH ) ) );
};

/** The longest suffix of at most `TAIL_LENGTH` characters that does not start inside a grapheme cluster */
const sliceTail = ( value: string ): string => {
  const windowStart = Math.max( 0, value.length - TAIL_LENGTH - SEGMENT_WINDOW );
  // Segment 0 may begin inside a cluster and is never needed: the window is wider than the tail
  const starts = [ ...segmenter.segment( value.slice( windowStart ) ) ].slice( 1 ).map( ( { index } ) => windowStart + index );
  return value.slice( Math.min( value.length, ...starts.filter( start => value.length - start <= TAIL_LENGTH ) ) );
};

/**
 * Cuts a long string to its first 1,000 characters, a `... [N more characters omitted] ...` marker and its last 24 characters.
 * Strings up to 1,024 characters are returned whole. Cuts never split a grapheme cluster (emoji, accents).
 *
 * @param value - String to truncate
 * @returns The string, or its truncated form
 */
export const truncateString = ( value: string ): string => {
  if ( value.length <= MAX_STRING_LENGTH ) {
    return value;
  }
  const head = sliceHead( value );
  const tail = sliceTail( value );
  return `${head}... [${value.length - head.length - tail.length} more characters omitted] ...${tail}`;
};

/**
 * Keeps the first 10 lines of a stack trace and notes how many were omitted.
 *
 * @param stack - Stack trace text
 * @returns The stack, or its first lines
 */
export const truncateStack = ( stack: string ): string => {
  const lines = stack.split( '\n' );
  if ( lines.length <= MAX_STACK_LINES ) {
    return stack;
  }
  return [ ...lines.slice( 0, MAX_STACK_LINES ), `... [${lines.length - MAX_STACK_LINES} more lines omitted]` ].join( '\n' );
};

type WalkState = { visited: number };

const walkValue = ( value: unknown, depth: number, state: WalkState ): unknown => {
  if ( state.visited >= MAX_VISITED_VALUES ) {
    return Marker.maxValues;
  }
  if ( depth >= MAX_VALUE_DEPTH ) {
    return Marker.maxDepth;
  }
  state.visited++;

  if ( typeof value === 'string' ) {
    return truncateString( value );
  }

  if ( Array.isArray( value ) ) {
    const items = value.slice( 0, MAX_ARRAY_ITEMS ).map( item => walkValue( item, depth + 1, state ) );
    return value.length > MAX_ARRAY_ITEMS ? [ ...items, `... [${value.length - MAX_ARRAY_ITEMS} more items omitted]` ] : items;
  }

  if ( value === null || typeof value !== 'object' ) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for ( const [ key, item ] of Object.entries( value ) ) {
    if ( Object.keys( result ).length === MAX_OBJECT_KEYS ) {
      result['...'] = Marker.maxKeys;
      break;
    }
    result[key] = walkValue( item, depth + 1, state );
  }
  return result;
};

/**
 * Caps a decoded JSON value: long strings, long arrays, wide objects, deep nesting and many values are cut
 * with a marker that says what was left out. Short values pass through unchanged.
 *
 * @param value - Decoded JSON value
 * @returns A copy within the limits
 */
export const truncateValue = ( value: unknown ): unknown => walkValue( value, 0, { visited: 0 } );
