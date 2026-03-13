import { ZodType } from 'zod';

/**
 * Detects if a schema is a ZodType instance
 * @param {unknown} schema - The schema to check
 * @returns {boolean} True if the schema is a Zod schema
 */
export const isZodSchema = schema => schema instanceof ZodType;
