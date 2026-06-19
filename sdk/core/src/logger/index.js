import winston from 'winston';
import { contextFormat } from './context_format.js';

const { options } = await import( process.env.NODE_ENV === 'production' ? './production.js' : './development.js' );

// creates the root winston logger; contextFormat runs first so every log emitted
// inside an activity is enriched with its workflow execution context
const logger = winston.createLogger( {
  ...options,
  format: winston.format.combine( contextFormat(), options.format )
} );

/**
 * Creates a child logger with a specific namespace
 *
 * @param {string} namespace - The namespace for this logger (e.g., 'Scanner', 'Tracing')
 * @returns {winston.Logger} Child logger instance with namespace metadata
 */
export const createChildLogger = namespace => logger.child( { namespace } );
