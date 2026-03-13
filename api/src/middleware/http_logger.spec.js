import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock( '#configs', () => ( { isProduction: true } ) );

vi.mock( '#logger', () => ( {
  logger: {
    http: vi.fn(),
    warn: vi.fn()
  }
} ) );

import { logger } from '#logger';
import { createHttpLoggingMiddleware } from './http_logger.js';

/** Minimal app that sets res.locals.error and status for logging assertions. */
function createApp( routeHandler ) {
  const app = express();
  app.use( express.json( { limit: '2mb' } ) );
  app.use( ( req, _res, next ) => {
    req.id = req.get( 'x-request-id' ) || 'test-request-id';
    next();
  } );
  app.use( createHttpLoggingMiddleware() );
  app.post( '/workflow', routeHandler );
  return app;
}

describe( 'http_logger', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'includes request size fields for 413 errors', async () => {
    const app = createApp( ( _req, res ) => {
      const error = new Error( 'request entity too large' );
      error.status = 413;
      error.limit = '2mb';
      res.locals.error = error;
      res.status( 413 ).send( {} );
    } );

    await request( app )
      .post( '/workflow' )
      .set( 'X-Request-ID', 'test-request-id' )
      .send( {} )
      .expect( 413 );

    expect( logger.http ).toHaveBeenCalledWith(
      'HTTP request',
      expect.objectContaining( {
        method: 'POST',
        url: '/workflow',
        status: 413,
        requestId: 'test-request-id',
        errorType: 'Error',
        errorMessage: 'request entity too large',
        requestSizeBytes: '2',
        requestSizeMB: '0.00',
        limit: '2mb'
      } )
    );
  } );

  it( 'handles missing content-length for 413 errors', done => {
    const middleware = createHttpLoggingMiddleware();
    const error = new Error( 'request entity too large' );
    error.status = 413;
    error.limit = '2mb';
    const req = { id: 'test-request-id', url: '/workflow', method: 'POST', headers: {}, body: {} };
    const res = {
      locals: { error },
      statusCode: 413,
      getHeader: vi.fn().mockReturnValue( '0' ),
      once: vi.fn( ( event, cb ) => {
        if ( event === 'finish' ) {
          setImmediate( () => {
            cb();
            expect( logger.http ).toHaveBeenCalledWith(
              'HTTP request',
              expect.objectContaining( { requestSizeBytes: undefined, requestSizeMB: 'unknown', limit: '2mb' } )
            );
            done();
          } );
        }
      } )
    };
    middleware( req, res, () => {} );
  } );

  it( 'does not include request size fields for non-413 errors', async () => {
    const app = createApp( ( _req, res ) => {
      res.locals.error = new Error( 'Something went wrong' );
      res.status( 500 ).send( {} );
    } );

    await request( app ).post( '/workflow' ).set( 'X-Request-ID', 'test-request-id' ).send( {} ).expect( 500 );

    const logData = logger.http.mock.calls[0][1];
    expect( logData ).not.toHaveProperty( 'requestSizeBytes' );
    expect( logData ).not.toHaveProperty( 'requestSizeMB' );
    expect( logData ).not.toHaveProperty( 'limit' );
  } );
} );
