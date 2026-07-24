import { inspect } from 'util';

const MAX_VALUE_DEPTH = 10;
const MAX_PROTOTYPE_DEPTH = 10;
const MAX_STRING_LEN = 16_384;
const MAX_OBJECT_KEYS = 50;
const MAX_OBJECT_KEY_LEN = 256;
const MAX_ARRAY_SIZE = 50;
const DEFAULT_EXCLUDE_PROPS = [
  '__proto__',
  /* Temporal failures without `.failure` because it contains Temporal’s large internal
    protobuf representation and duplicates the useful error details. */
  'failure',
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

const invokeGetter = ( obj, getter ) => {
  try {
    return getter.call( obj );
  } catch {
    return undefined; // eslint-disable-line consistent-return
    /** It is ok to ignore these */
  }
};

const truncateString = ( v, size = MAX_STRING_LEN ) => v.length <= size ? v : `${v.slice( 0, size )}... ${v.length - size} more characters`;
const truncateArray = ( v, size = MAX_ARRAY_SIZE ) => v.length <= size ? v : v.slice( 0, size ).concat( `... ${v.length - size} more items` );

/** Detect non-recursive complex types */
const shouldInspectValue = v =>
  [ RegExp, Date ].some( C => v instanceof C ) ||
  [ 'bigint', 'function', 'symbol' ].includes( typeof v ) ||
  ArrayBuffer.isView( v );

/** Recursively serialize an object using its property descriptors */
const serializeObject = ( { target, receiver, options: { includeStack, excludeProps, depth, maxProps = MAX_OBJECT_KEYS } } ) => {
  const excludeKeys = DEFAULT_EXCLUDE_PROPS.concat( includeStack ? [] : [ 'stack' ] ).concat( excludeProps ?? [] );

  const properties = {};
  const keys = Object.getOwnPropertyNames( target );
  for ( const key of keys ) {
    if ( Object.keys( properties ).length === maxProps ) {
      delete properties['...'];
      properties['...'] = 'possibly more properties';
      break;
    }
    if ( excludeKeys.some( e => e.test ? e.test( key ) : e === key ) ) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor( target, key );
    const value = Object.hasOwn( descriptor, 'get' ) ? invokeGetter( receiver, descriptor.get ) : descriptor.value;
    if ( value === undefined || typeof value === 'function' ) {
      continue;
    }

    const truncatedKey = truncateString( key, MAX_OBJECT_KEY_LEN );
    if ( Object.hasOwn( properties, truncatedKey ) ) { // do not overwrite similar keys
      continue;
    }
    properties[truncatedKey] = serializeValue( value, { includeStack, excludeProps, depth: depth + 1 } ); // eslint-disable-line no-use-before-define
  }
  return properties;
};

/** Recursively serialize an object navigating up in its prototype chain */
const serializePrototypeChain = ( { target, receiver, options, protoChainDepth = 0 } ) => {
  if ( !target || protoChainDepth >= MAX_PROTOTYPE_DEPTH ) {
    return {};
  }
  const nextPrototype = Object.getPrototypeOf( target );
  const inherited = serializePrototypeChain( { target: nextPrototype, receiver, options, protoChainDepth: protoChainDepth + 1 } );
  return { ...inherited, ...serializeObject( { target, receiver, options } ) };
};

/** Converts an iterable to array, recursively serializing its values */
const serializeIterable = ( v, options, maxSize = MAX_ARRAY_SIZE ) => {
  const values = [];
  const iterator = v instanceof Set ? v.values() : v.entries();
  const state = { next: undefined };
  while ( values.length < maxSize && !( state.next = iterator.next() ).done ) {
    values.push( serializeValue( state.next.value, { ...options, depth: options.depth + 1 } ) ); // eslint-disable-line no-use-before-define
  }
  return values.concat( v.size > maxSize ? `... ${v.size - maxSize} more items` : [] );
};

/** Recursive serialize a value, recursion comes for Array-like values and objects */
const serializeValue = ( target, { includeStack, depth, excludeProps } ) => {
  // Non-recursive complex values are "inspected"
  if ( shouldInspectValue( target ) ) {
    return truncateString( inspect( target, {
      depth: 0,
      maxStringLength: MAX_STRING_LEN,
      maxArrayLength: MAX_ARRAY_SIZE,
      breakLength: Infinity,
      colors: false,
      customInspect: false
    } ) );
  }

  // Strings
  if ( typeof target === 'string' ) {
    return truncateString( target );
  }

  // Primitives are returned as they are
  if ( typeof target !== 'object' || target === null ) {
    return target;
  }
  // Depth control
  if ( depth >= MAX_VALUE_DEPTH ) {
    return '[Max Depth]';
  }

  const options = { includeStack, depth, excludeProps };

  // Maps/Sets use a helper function
  if ( [ Map, Set ].some( I => target instanceof I ) ) {
    return serializeIterable( target, options );
  }
  // Array as also recursively serialized
  if ( Array.isArray( target ) ) {
    return truncateArray( target ).map( value => serializeValue( value, { ...options, depth: depth + 1 } ) );
  }

  // Objects are handle in a separate serializer that takes care of props and proto chain
  const props = serializePrototypeChain( { target, receiver: target, options } );

  // Figure it out the .name
  // Rule is: assigned .name > .name from proto chain (<>"Error") > constructor.name
  const constructorName = target.constructor?.name;
  if ( target instanceof Error && !Object.hasOwn( target, 'name' ) && props.name === 'Error' && constructorName && constructorName !== 'Error' ) {
    return { ...props, name: constructorName };
  }
  return props;
};

/**
 * Converts an error-like value and its inherited properties into a plain object.
 * Serializes recursively, including values inside Arrays, maps and sets.
 * Has depth, prototype depth, max string size, max array/map/set size, max object props count limits.
 *
 * @param {*} target - Value to serialize
 * @param {object} [options] - Serialization options
 * @param {boolean} [options.includeStack=true] - Whether to include error stacks at every level
 * @param {string[]} [options.excludeProps=[]] - Extra properties to exclude
 * @returns {*} Serialized value
 */
export const serializeError = ( target, { includeStack = true, excludeProps = [] } = {} ) =>
  serializeValue( target, { includeStack, excludeProps, depth: 0 } );

/**
 * Checks whether a value inherits from a constructor matching any supplied class name.
 * @param {*} obj - Value whose prototype chain to inspect
 * @param {string[]} classNames - Constructor names to match
 * @returns {boolean} Whether a matching constructor exists
 */
export const inheritsFromAnyNamedType = ( obj, classNames ) => {
  if ( classNames.length === 0 ) {
    return false;
  }
  if ( obj === null || ( typeof obj !== 'object' && typeof obj !== 'function' ) ) {
    return false;
  }

  const prototype = Object.getPrototypeOf( obj );
  if ( !prototype ) {
    return false;
  }

  const constructor = Object.getOwnPropertyDescriptor( prototype, 'constructor' )?.value;
  if ( constructor?.name && classNames.includes( constructor.name ) ) {
    return true;
  }
  return inheritsFromAnyNamedType( prototype, classNames );
};
