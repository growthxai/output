import { tryOrUndefined } from './function.js';
import { redactUrl } from './redact.js';
import { isUrl } from './string.js';

const MAX_VALUE_DEPTH = 10;
const MAX_PROTOTYPE_DEPTH = 10;
const MAX_STRING_LEN = 16_384;
const MAX_OBJECT_KEYS = 50;
const MAX_OBJECT_KEY_LEN = 256;
const MAX_ARRAY_SIZE = 50;
const MAX_SERIALIZED_VALUES = 1000;
const MAX_BIGINT = 10n ** BigInt( MAX_STRING_LEN - 1 ); // room for sign + trailing "n"
const GLOBAL_IGNORED_KEYS = [
  '__proto__',
  // Raw Temporal wire failure; duplicates normalized causes/details and may contain encoded payloads.
  'failure',
  // Raw failure retained by Nexus for lossless round-tripping; duplicates surfaced diagnostics and internal payloads.
  'originalFailure',
  // Protobufjs reflection metadata; points into a large cyclic schema graph with no diagnostic value.
  '$type',
  // HTTP request/response
  /^request$/i,
  /^request_?body$/i,
  /^request_?body_?values$/i,
  /^response$/i,
  // Headers
  /^headers$/i,
  /^request_?headers$/i,
  /^response_?headers$/i,
  // Credentials
  /authorization$/i,
  /authentication$/i,
  /cookie$/i,
  /key$/i,
  /token$/i,
  /password$/i,
  /secret$/i,
  /credentials?$/i
];

const Marker = {
  BigIntTooLarge: '[BigInt too large]',
  Circular: '[Circular Reference]',
  MaxDepth: '[Maximum Depth Reached]',
  MaxKeys: '[Maximum Object Properties Reached]',
  MaxSelfCalls: '[Serialization Limit Reached]',
  Unserializable: '[Unserializable]',
  InvalidDate: '[Invalid Date]',
  TruncatedArray: '... [:v more items omitted]',
  TruncatedString: '... [:v more characters omitted]'
};

export const truncateString = ( v, max = MAX_STRING_LEN ) =>
  v.length <= max ? v : ( v.slice( 0, max ) + Marker.TruncatedString.replace( ':v', v.length - max ) );

export const truncateArray = ( v, max = MAX_ARRAY_SIZE ) =>
  v.length <= max ? v : v.slice( 0, max ).concat( Marker.TruncatedArray.replace( ':v', v.length - max ) );

/** Converts a prototype chain to a max sized array */
export const flattenPrototypeChain = ( target, depth = 0, result = [], maxDepth = MAX_PROTOTYPE_DEPTH ) =>
  !target || depth >= maxDepth ? result :
    flattenPrototypeChain( Object.getPrototypeOf( target ), depth + 1, result.concat( target ), maxDepth );

/**
 * Define the best "name" for an Error object
 * Rules: Assigned .name property > inherited .name if not "Error" > constructor.name
 */
export const resolveErrorName = target => {
  // if its not error, don't return anything
  if ( !( target instanceof Error ) ) {
    return undefined;
  }

  const name = tryOrUndefined( () => target.name );
  // if name is an explicit property return it
  if ( Object.hasOwn( target, 'name' ) ) {
    return name; // eslint-disable-line consistent-return
  }

  // if not explicit (resolves from parent) check if it not a default prop
  if ( name !== undefined && name !== 'Error' ) {
    return name; // eslint-disable-line consistent-return
  }
  // fallback to the constructor name, or undefined
  return target.constructor?.name; // eslint-disable-line consistent-return
};

/** Check is target is in ancestor chain */
const isAncestor = ( ancestor, target ) =>
  ancestor !== null && ( ancestor.value === target || isAncestor( ancestor.ancestor, target ) );

class GlobalCounter {
  value = 0;
  count() {
    this.value++;
    return this;
  };
}

/** Recursive serialize a value, recursion comes for Array-like values and objects */
const serializeValue = ( target, options, state = { depth: 0, seen: new GlobalCounter(), ancestor: null } ) => {
  // If the same object was already seen in this branch, it is a circular reference
  if ( isAncestor( state.ancestor, target ) ) {
    return Marker.Circular;
  }

  // Reached the maximum times the function can self call
  if ( state.seen.value >= MAX_SERIALIZED_VALUES ) {
    return Marker.MaxSelfCalls;
  }

  // Depth control
  if ( state.depth >= MAX_VALUE_DEPTH ) {
    return Marker.MaxDepth;
  }

  const nextState = {
    depth: state.depth + 1,
    seen: state.seen.count(),
    ancestor: { value: target, ancestor: state.ancestor }
  };

  try {
    if ( target instanceof Date ) {
      return Number.isNaN( target.getTime() ) ? Marker.InvalidDate : target.toISOString();
    }

    if ( target instanceof RegExp ) {
      return target.toString();
    }

    if ( typeof target === 'bigint' ) {
      return ( target >= MAX_BIGINT || target <= -MAX_BIGINT ) ? Marker.BigIntTooLarge : `${target}n`;
    }

    if ( typeof target === 'symbol' ) {
      return truncateString( target.toString() );
    }

    if ( typeof target === 'function' ) {
      return `[Function: ${target.name || '(anonymous)'}]`;
    }

    // Buffers, typed arrays, and raw ArrayBuffers
    if ( ArrayBuffer.isView( target ) || target instanceof ArrayBuffer ) {
      const sizeKey = target instanceof ArrayBuffer || target instanceof DataView ? 'byteLength' : 'length';
      return `${target.constructor.name}(${target[sizeKey]})`;
    }

    if ( typeof target === 'string' ) {
      return truncateString( isUrl( target ) ? redactUrl( target ) : target );
    }

    // Other primitives are returned as they are
    if ( typeof target !== 'object' || target === null ) {
      return target;
    }

    if ( target instanceof URL ) {
      return truncateString( redactUrl( target ) );
    }

    // Maps/Sets use a helper function
    if ( [ Map, Set ].some( I => target instanceof I ) ) {
      const iterator = target instanceof Set ? target.values() : target.entries();
      const values = iterator.take( MAX_ARRAY_SIZE ).toArray().map( v => serializeValue( v, options, nextState ) );
      return values.concat( target.size > MAX_ARRAY_SIZE ? Marker.TruncatedArray.replace( ':v', target.size - MAX_ARRAY_SIZE ) : [] );
    }

    // Array as also recursively serialized
    if ( Array.isArray( target ) ) {
      return truncateArray( target ).map( value => serializeValue( value, options, nextState ) );
    }

    // Objects
    const prototypes = flattenPrototypeChain( target );
    const receiver = target;

    const props = prototypes.reduce( ( projection, proto ) => {
      if ( Object.keys( projection ).length > MAX_OBJECT_KEYS ) {
        return projection;
      }

      const keys = Object.getOwnPropertyNames( proto );
      for ( const key of keys ) {
        if ( options.ignoredKeys.some( e => e.test ? e.test( key ) : e === key ) ) {
          continue;
        }

        const sanitizedKey = truncateString( key, MAX_OBJECT_KEY_LEN );
        if ( Object.hasOwn( projection, sanitizedKey ) ) { // do not overwrite similar keys
          continue;
        }

        const value = tryOrUndefined( () => Reflect.get( proto, key, receiver ) );
        if ( value === undefined || typeof value === 'function' ) {
          continue;
        }

        // after confirming the key is valid, check if it would break the limit
        if ( Object.keys( projection ).length === MAX_OBJECT_KEYS ) {
          delete projection['...']; // make sure this is the last added property
          return Object.assign( projection, { ['...']: Marker.MaxKeys } );
        }

        projection[sanitizedKey] = serializeValue( value, options, nextState );
      };
      return projection;
    }, {} );

    // name resolver
    if ( !options.ignoredKeys.includes( 'name' ) && target instanceof Error ) {
      const name = resolveErrorName( target );
      if ( name !== undefined ) {
        props.name = name;
      }
    }

    return props;
  } catch {
    return Marker.Unserializable;
  }
};

/**
 * Converts an error-like value and its inherited properties into a plain object.
 * Serializes recursively, including values inside Arrays, maps and sets.
 * Has depth, prototype depth, max string size, max array/map/set size, max object props count limits.
 *
 * @param {*} target - Value to serialize
 * @param {object} [options] - Serialization options
 * @param {array} [options.dropKeys=[]] - Keys to exclude from the serialization (including recursion)
 * @returns {*} Serialized value
 */
export const serializeError = ( target, { dropKeys } = {} ) =>
  serializeValue( target, { ignoredKeys: GLOBAL_IGNORED_KEYS.concat( dropKeys ?? [] ) } );
