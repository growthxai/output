import winston from 'winston';

const { options } = await import( process.env.NODE_ENV === 'production' ? './production.js' : './development.js' );

// creates the de root winston logger
const logger = winston.createLogger( options );

/**
 * Creates a child logger with a specific namespace
 *
 * @param {string} namespace - The namespace for this logger (e.g., 'Scanner', 'Tracing')
 * @returns {winston.Logger} Child logger instance with namespace metadata
 */
export const createChildLogger = namespace => logger.child( { namespace } );
