import { METADATA_ACCESS_SYMBOL } from '#consts';

/**
 * Add metadata "values" property to a given object
 * @param {object} target
 * @param {object} values
 * @returns
 */
export const setMetadata = ( target, values ) =>
  Object.defineProperty( target, METADATA_ACCESS_SYMBOL, { value: values, writable: false, enumerable: false, configurable: false } );
