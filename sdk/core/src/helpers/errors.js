import { inspect } from 'util';

const MAX_VALUE_DEPTH = 10;
const MAX_PROTOTYPE_DEPTH = 10;

const invokeGetter = ( obj, getter ) => {
  try {
    return getter.call( obj );
  } catch {
    return undefined; // eslint-disable-line consistent-return
    /** It is ok to ignore these */
  }
};

/** Detect non-recursive complex types */
const shouldInspectValue = v =>
  [ RegExp, Date ].some( C => v instanceof C ) ||
  [ 'bigint', 'function', 'symbol' ].includes( typeof v ) ||
  ArrayBuffer.isView( v );

/** Recursively serialize an object using its property descriptors */
const serializeObject = ( { target, receiver, options: { includeStack, excludeProps, depth } } ) => {
  const excludeKeys = [ '__proto__' ].concat( includeStack ? [] : [ 'stack' ] ).concat( excludeProps ?? [] );

  const properties = {};
  for ( const [ k, descriptor ] of Object.entries( Object.getOwnPropertyDescriptors( target ) ) ) {
    if ( excludeKeys.includes( k ) ) {
      continue;
    }
    const value = Object.hasOwn( descriptor, 'get' ) ? invokeGetter( receiver, descriptor.get ) : descriptor.value;
    if ( value === undefined || typeof value === 'function' ) {
      continue;
    }
    // eslint-disable-next-line no-use-before-define
    properties[k] = serializeValue( value, { includeStack, excludeProps, depth: depth + 1 } );
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

/** Recursive serialize a value, recursion comes for Array-like values and objects */
const serializeValue = ( target, { includeStack, depth, excludeProps } ) => {
  // Non-recursive complex values are "inspected"
  if ( shouldInspectValue( target ) ) {
    return inspect( target, { depth: 0, breakLength: Infinity, colors: false, customInspect: false } );
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

  // Maps are converted to tuples array and recursively serialized
  if ( target instanceof Map ) {
    return serializeValue( [ ...target.entries() ], { ...options, depth: depth + 1 } );
  }
  // Sets are converted to array and also recursively serialized
  if ( target instanceof Set ) {
    return serializeValue( [ ...target.values() ], { ...options, depth: depth + 1 } );
  }
  // Array as also recursively serialized
  if ( Array.isArray( target ) ) {
    return target.map( value => serializeValue( value, { ...options, depth: depth + 1 } ) );
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
 * Converts an error-like value and its inherited properties into a depth-limited diagnostic representation.
 * @param {*} obj - Value to serialize
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
