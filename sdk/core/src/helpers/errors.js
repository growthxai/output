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
