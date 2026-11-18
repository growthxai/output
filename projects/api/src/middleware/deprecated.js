import { logger } from '#logger';

/**
 * Advertise a route as deprecated and point clients at its successor.
 *
 * Emits RFC 9745 `Deprecation`, RFC 8594 `Sunset`, and RFC 8288 `Link` headers
 * on every response, and logs a warning each time the route is hit so adoption
 * of the successor can be measured.
 *
 * @param {Object} options
 * @param {string} options.successor - URL template for the successor route (e.g. '/workflow/{id}/runs/{rid}/stop').
 * @param {string} options.sunset - RFC 8594 sunset date in HTTP-date format (e.g. "Thu, 16 Jul 2026 00:00:00 GMT").
 * @returns {import('express').RequestHandler}
 */
export default function deprecated( { successor, sunset } ) {
  return ( req, res, next ) => {
    res.set( {
      Deprecation: 'true',
      Sunset: sunset,
      Link: `<${successor}>; rel="successor-version"`
    } );
    logger.warn( 'Deprecated route hit', { path: req.path, method: req.method, successor } );
    next();
  };
}
