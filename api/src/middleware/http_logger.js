import morgan from 'morgan';
import { logger } from '#logger';
import { isProduction } from '#configs';

const HEALTH_ENDPOINTS = new Set( [ '/health', '/heartbeat' ] );

/**
 * Returns true if the request URL is a health or heartbeat endpoint.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
const shouldSkipLogging = req => HEALTH_ENDPOINTS.has( req.url );

/**
 * For status 413 with an error, returns request size (bytes and MB) and the configured limit.
 * @param {number} status - HTTP status code
 * @param {Error|null} error - Response error (may have .limit)
 * @param {string|undefined} contentLength - Request Content-Length header
 * @returns {{ requestSizeBytes?: string, requestSizeMB?: string, limit?: unknown }}
 */
const getPayloadSizeFields = ( status, error, contentLength ) => {
  if ( status !== 413 || !error ) {
    return {};
  }
  const sizeBytes = contentLength ? parseInt( contentLength, 10 ) : NaN;
  return {
    requestSizeBytes: contentLength,
    requestSizeMB: !Number.isNaN( sizeBytes ) ? ( sizeBytes / 1024 / 1024 ).toFixed( 2 ) : 'unknown',
    limit: error?.limit
  };
};

/**
 * Extracts information about the request and response.
 * @param {import('morgan').TokenIndexer} tokens - Morgan token accessor
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Record<string, unknown>}
 */
const gatherLogInfo = ( tokens, req, res ) => {
  const status = Number.parseInt( tokens.status( req, res ), 10 ) || 0;
  const requestContentLength = req?.headers?.['content-length'];

  return {
    method: tokens.method( req, res ),
    url: tokens.url( req, res ),
    status,
    contentLength: tokens.res( req, res, 'content-length' ) || '0',
    responseTime: Number.parseFloat( tokens['response-time']( req, res ) ) || 0,
    requestId: req.id,
    ...( res.locals.error ? {
      errorType: res.locals.error.constructor.name,
      errorMessage: res.locals.error.message
    } : {} ),
    ...getPayloadSizeFields( status, res.locals.error, requestContentLength ),
    workflowName: req.body?.workflowName ? req.body.workflowName : undefined
  };
};

/**
 * Parses and sends out a JSON message to the logger.
 * @param {string} message - Single line of JSON from morgan
 */
const prodStreamWrite = message => {
  try {
    const parsedMessage = JSON.parse( message );
    logger.http( 'HTTP request', parsedMessage );
  } catch ( parseError ) {
    if ( parseError instanceof SyntaxError ) {
      logger.warn( 'Failed to parse HTTP log JSON', {
        raw: message.trim(),
        parseError: parseError.message
      } );
    } else {
      throw parseError;
    }
  }
};

/**
 * Returns morgan middleware that logs each request as a single JSON object.
 * @returns {import('express').RequestHandler}
 */
const createProdHttpLogger = () =>
  morgan( ( tokens, req, res ) => JSON.stringify( gatherLogInfo( tokens, req, res ) ), {
    skip: shouldSkipLogging,
    stream: { write: prodStreamWrite }
  } );

/**
 * Passes the trimmed message to the HTTP logger.
 * @param {string} message - Human-readable log line
 */
const devStreamWrite = message => {
  logger.http( message.trim() );
};

/**
 * Returns morgan middleware that logs each request as one human-readable line
 * @returns {import('express').RequestHandler}
 */
const createDevHttpLogger = () =>
  morgan( ( tokens, req, res ) => {
    const { method, url, status, contentLength, responseTime, errorType, errorMessage } = gatherLogInfo( tokens, req, res );
    return `${method} ${url} ${status} ${contentLength}b ${responseTime}ms ${errorType ? `[${errorType}: ${errorMessage}]` : ''}`;
  }, {
    skip: shouldSkipLogging,
    stream: { write: devStreamWrite }
  } );

/**
 * Returns HTTP logging middleware
 * @returns {import('express').RequestHandler}
 */
export const createHttpLoggingMiddleware = () => isProduction ? createProdHttpLogger() : createDevHttpLogger();
