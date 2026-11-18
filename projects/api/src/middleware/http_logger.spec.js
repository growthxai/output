import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock( '#configs', () => ( { isProduction: true } ) );

vi.mock( '#logger', () => ( {
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    http: vi.fn()
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

  it( 'logs 4xx at warn with a descriptive message and request size fields for 413', async () => {
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

    expect( logger.warn ).toHaveBeenCalledWith(
      expect.stringMatching( /^POST \/workflow 413 [\d.]+ms$/ ),
      expect.objectContaining( {
        method: 'POST',
        url: '/workflow',
        statusCode: 413,
        requestId: 'test-request-id',
        errorType: 'Error',
        errorMessage: 'request entity too large',
        requestSizeBytes: '2',
        requestSizeMB: '0.00',
        limit: '2mb'
      } )
    );
    expect( logger.error ).not.toHaveBeenCalled();
    expect( logger.http ).not.toHaveBeenCalled();
  } );

  it( 'logs 5xx at error and omits request size fields for non-413 errors', async () => {
    const app = createApp( ( _req, res ) => {
      res.locals.error = new Error( 'Something went wrong' );
      res.status( 500 ).send( {} );
    } );

    await request( app ).post( '/workflow' ).set( 'X-Request-ID', 'test-request-id' ).send( {} ).expect( 500 );

    expect( logger.error ).toHaveBeenCalledTimes( 1 );
    const [ message, logData ] = logger.error.mock.calls[0];
    expect( message ).toMatch( /^POST \/workflow 500 [\d.]+ms$/ );
    expect( logData ).toMatchObject( { statusCode: 500, errorType: 'Error', errorMessage: 'Something went wrong' } );
    expect( logData ).not.toHaveProperty( 'requestSizeBytes' );
    expect( logData ).not.toHaveProperty( 'requestSizeMB' );
    expect( logData ).not.toHaveProperty( 'limit' );
    expect( logger.warn ).not.toHaveBeenCalled();
  } );

  it( 'logs 2xx at http level', async () => {
    const app = createApp( ( _req, res ) => res.status( 200 ).send( { ok: true } ) );

    await request( app ).post( '/workflow' ).set( 'X-Request-ID', 'test-request-id' ).send( {} ).expect( 200 );

    expect( logger.http ).toHaveBeenCalledWith(
      expect.stringMatching( /^POST \/workflow 200 [\d.]+ms$/ ),
      expect.objectContaining( { statusCode: 200, requestId: 'test-request-id' } )
    );
    expect( logger.error ).not.toHaveBeenCalled();
    expect( logger.warn ).not.toHaveBeenCalled();
  } );

  it( 'skips health and heartbeat endpoints', async () => {
    const app = express();
    app.use( createHttpLoggingMiddleware() );
    app.get( '/health', ( _req, res ) => res.sendStatus( 200 ) );

    await request( app ).get( '/health' ).expect( 200 );

    expect( logger.http ).not.toHaveBeenCalled();
    expect( logger.warn ).not.toHaveBeenCalled();
    expect( logger.error ).not.toHaveBeenCalled();
  } );

  it( 'logs once when both finish and close fire', () => {
    const middleware = createHttpLoggingMiddleware();
    const req = { id: 'test-request-id', url: '/workflow', originalUrl: '/workflow', method: 'POST', headers: {}, body: {} };
    const handlers = {};
    const res = {
      locals: {},
      statusCode: 200,
      getHeader: vi.fn().mockReturnValue( '2' ),
      once: vi.fn( ( event, cb ) => {
        handlers[event] = cb;
      } )
    };

    middleware( req, res, () => {} );
    handlers.finish();
    handlers.close();

    expect( logger.http ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'reports requestSizeMB "unknown" for a 413 with no content-length', () => {
    const middleware = createHttpLoggingMiddleware();
    const error = new Error( 'request entity too large' );
    error.status = 413;
    error.limit = '2mb';
    const req = { id: 'test-request-id', url: '/workflow', originalUrl: '/workflow', method: 'POST', headers: {}, body: {} };
    const handlers = {};
    const res = {
      locals: { error },
      statusCode: 413,
      getHeader: vi.fn().mockReturnValue( '0' ),
      once: vi.fn( ( event, cb ) => {
        handlers[event] = cb;
      } )
    };

    middleware( req, res, () => {} );
    handlers.finish();

    expect( logger.warn ).toHaveBeenCalledWith(
      expect.any( String ),
      expect.objectContaining( { requestSizeBytes: undefined, requestSizeMB: 'unknown', limit: '2mb' } )
    );
  } );
} );
