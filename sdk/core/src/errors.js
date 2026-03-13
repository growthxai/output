/**
 * These are errors exposed as tools for the user to break their flow
 * They work in both steps and workflows
 */

/**
 * Any generic fatal errors
 */
export class FatalError extends Error { }

/**
 * Any validation error
 */
export class ValidationError extends Error { }
