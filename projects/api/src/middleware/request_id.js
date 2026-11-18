import { randomUUID } from 'node:crypto';

const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[\w-]+$/;

const validateRequestId = id =>
  typeof id === 'string' && id.length <= MAX_REQUEST_ID_LENGTH && REQUEST_ID_PATTERN.test( id ) ?
    id :
    null;

export default function requestIdMiddleware( req, res, next ) {
  const requestId =
    validateRequestId( req.headers?.['rndr-id'] ) ||
    validateRequestId( req.headers?.['x-request-id'] ) ||
    randomUUID();

  req.id = requestId;
  res.setHeader( 'X-Request-ID', requestId );
  next();
}
