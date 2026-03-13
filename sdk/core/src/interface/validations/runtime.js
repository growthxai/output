import { ValidationError } from '#errors';

/**
 * Validates data against a Zod schema using safeParse
 * @param {unknown} schema - The Zod schema to validate against
 * @param {unknown} data - The data to validate
 * @param {string} context - Description of what's being validated (for error messages)
 * @throws {ValidationError} If validation fails
 * @returns {void}
 */
export function validateWithSchema( schema, data, context ) {
  if ( !schema ) {
    return;
  }

  const result = schema.safeParse( data );
  if ( !result.success ) {
    throw new ValidationError( `${context} validation failed: ${result.error.message}` );
  }
}
