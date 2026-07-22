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
 * Winston level for a response status: 5xx -> error, 4xx -> warn, else http.
 * @param {number} status
 * @returns {'error'|'warn'|'http'}
 */
const levelForStatus = status => {
  if ( status >= 500 ) {
    return 'error';
  }
  if ( status >= 400 ) {
    return 'warn';
  }
  return 'http';
};

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
 * Builds the structured log record for a completed request/response.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ method: string, url: string, responseTime: number }} timing
 * @returns {Record<string, unknown>}
 */
const gatherLogInfo = ( req, res, { method, url, responseTime } ) => {
  const status = res.statusCode;
  const error = res.locals?.error;
  const requestContentLength = req.headers?.['content-length'];

  return {
    method,
    url,
    statusCode: status,
    contentLength: String( res.getHeader( 'content-length' ) ?? '0' ),
    responseTime,
    requestId: req.id,
    ...( error ? {
      errorType: error.constructor.name,
      errorMessage: error.message
    } : {} ),
    ...getPayloadSizeFields( status, error, requestContentLength ),
    workflowName: req.body?.workflowName
  };
};

/**
 * Emits the request log at a status-appropriate level. Production logs a descriptive
 * message plus the structured record; development logs a single human-readable line.
 * @param {Record<string, unknown>} info
 */
const emit = info => {
  const { statusCode, ...rest } = info;
  const { method, url, contentLength, responseTime, errorType, errorMessage } = rest;
  const level = levelForStatus( statusCode );

  if ( isProduction ) {
    logger[level]( `${method} ${url} ${statusCode} ${responseTime}ms`, { ...rest, statusCode } );
  } else {
    const errorSuffix = errorType ? ` [${errorType}: ${errorMessage}]` : '';
    logger[level]( `${method} ${url} ${statusCode} ${contentLength}b ${responseTime}ms${errorSuffix}` );
  }
};

/**
 * Express middleware that logs each request once, on response completion, at a level
 * derived from the response status. Listens for both 'finish' (response sent) and
 * 'close' (connection ended, e.g. client abort mid-stream) so aborted requests are
 * still recorded; a guard ensures a single emission.
 * @returns {import('express').RequestHandler}
 */
export const createHttpLoggingMiddleware = () => ( req, res, next ) => {
  if ( shouldSkipLogging( req ) ) {
    next();
    return;
  }

  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl ?? req.url;
  const state = { logged: false };

  const log = () => {
    if ( state.logged ) {
      return;
    }
    state.logged = true;
    const responseTime = Date.now() - start;
    emit( gatherLogInfo( req, res, { method, url, responseTime } ) );
  };

  res.once( 'finish', log );
  res.once( 'close', log );

  next();
};
