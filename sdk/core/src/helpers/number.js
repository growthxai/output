/**
 * Returns true if the value is a finite number greater than or equal to zero.
 * @param {unknown} v
 * @returns {boolean}
 */
export const isNonNegativeNumber = v => Number.isFinite( v ) && v >= 0;

/**
 * Returns true if the value is a safe integer greater than or equal to zero.
 * @param {unknown} v
 * @returns {boolean}
 */
export const isNonNegativeInteger = v => Number.isSafeInteger( v ) && v >= 0;

/**
 * Sums the non-negative safe integers among the values, ignoring all others.
 * @param {...unknown} values
 * @returns {number}
 */
export const safeSum = ( ...values ) => values.filter( isNonNegativeInteger ).reduce( ( t, v ) => t + v, 0 );
