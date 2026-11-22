type JsonObject = Record<string, unknown>;

interface SecondsNanos {
  seconds?: string | number;
  nanos?: string | number;
}

const isObject = ( value: unknown ): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray( value );

/** True when the value is only the protobuf seconds/nanos pair used by Timestamp and Duration */
const isSecondsNanos = ( value: JsonObject ): boolean => Object.keys( value ).every( key => key === 'seconds' || key === 'nanos' );

const isDurationKey = ( key: string ): boolean => /(?:Timeout|Duration|Interval|Backoff|Delay)$/.test( key );

const isTimestampKey = ( key: string ): boolean => /(?:Time|Timestamp)$/.test( key );

/** int64 ids Temporal tools print as strings; Message.toJSON already does this, plain fixtures may not */
const isInt64IdKey = ( key: string ): boolean => key === 'eventId' || key.endsWith( 'EventId' );

const toNumber = ( value: string | number | undefined ): number => {
  if ( value === undefined ) {
    return 0;
  }
  return typeof value === 'number' ? value : Number( value ) || 0;
};

/** Drops trailing groups of three zeros while more than three digits remain (ProtoJSON nanos style) */
const trimNanosFraction = ( digits: string ): string => (
  digits.length > 3 && digits.endsWith( '000' ) ? trimNanosFraction( digits.slice( 0, -3 ) ) : digits
);

/**
 * ProtoJSON nanos fraction: nine digits, then trailing groups of three zeros dropped (500000000 -> "500").
 *
 * @param nanos - Absolute nanosecond value
 * @returns Fraction digits without a leading dot
 */
const formatNanosFraction = ( nanos: number ): string => trimNanosFraction( String( Math.abs( nanos ) ).padStart( 9, '0' ) );

/**
 * Formats a Timestamp the way Temporal history JSON does: an RFC 3339 UTC string.
 *
 * @param value - `{ seconds, nanos }` from Message.toJSON or a plain fixture
 * @returns e.g. `1970-01-01T00:00:10.500Z`
 */
const formatTimestamp = ( value: SecondsNanos ): string => {
  const seconds = toNumber( value.seconds );
  const nanos = toNumber( value.nanos );
  const iso = new Date( seconds * 1000 ).toISOString();
  if ( !nanos ) {
    return iso.replace( /\.\d+Z$/, 'Z' );
  }
  return iso.replace( /\.\d+Z$/, `.${formatNanosFraction( nanos )}Z` );
};

/**
 * Formats a Duration the way Temporal history JSON does: a seconds string with an `s` suffix.
 *
 * @param value - `{ seconds, nanos }` from Message.toJSON or a plain fixture
 * @returns e.g. `60s`, `0s`, `1.500s`
 */
const formatDuration = ( value: SecondsNanos ): string => {
  const seconds = toNumber( value.seconds );
  const nanos = toNumber( value.nanos );
  const negative = seconds < 0 || nanos < 0;
  const fraction = nanos ? `.${formatNanosFraction( nanos )}` : '';
  return `${negative ? '-' : ''}${Math.abs( seconds )}${fraction}s`;
};

/**
 * Walks a JSON tree from Message.toJSON (or an equivalent plain object) and rewrites Timestamp /
 * Duration objects into Temporal-tool strings. Everything else is copied as-is.
 *
 * @param value - Node to serialize
 * @param key - Parent field name, used to tell Timestamp from Duration
 * @returns A new JSON-compatible value
 */
const serializeNode = ( value: unknown, key?: string ): unknown => {
  if ( Array.isArray( value ) ) {
    return value.map( item => serializeNode( item, key ) );
  }

  if ( !isObject( value ) ) {
    if ( key && typeof value === 'number' && Number.isInteger( value ) && isInt64IdKey( key ) ) {
      return String( value );
    }
    return value;
  }

  if ( key !== undefined && isSecondsNanos( value ) ) {
    const secondsNanos = value as SecondsNanos;
    if ( isDurationKey( key ) ) {
      return formatDuration( secondsNanos );
    }
    if ( isTimestampKey( key ) ) {
      return formatTimestamp( secondsNanos );
    }
  }

  return Object.fromEntries( Object.entries( value ).map( ( [ childKey, child ] ) => [
    childKey,
    serializeNode( child, childKey )
  ] ) );
};

/**
 * Converts a Temporal history event into the JSON shape Temporal tools use: enum names, string ids,
 * ISO-8601 times and `"Ns"` durations. Accepts a protobufjs message (`toJSON`) or an equivalent plain object.
 * Pure: returns a new tree and does not mutate the input.
 *
 * @param event - History event from Temporal or a plain fixture
 * @returns JSON-ready event object
 */
export const serializeHistoryEvent = ( event: unknown ): JsonObject => {
  const json = ( event as { toJSON?: () => unknown } )?.toJSON?.() ?? event;
  if ( !isObject( json ) ) {
    throw new TypeError( 'History event must be an object' );
  }
  return serializeNode( json ) as JsonObject;
};
