import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ZodError } from 'zod';

import { CatalogNotAvailableError, WorkflowNotFoundError } from '../clients/errors.js';

vi.mock( '#logger', () => ( {
  logger: {
    error: vi.fn()
  }
} ) );

vi.mock( '#configs', () => ( {
  get isProduction() {
    return false;
  }
} ) );

import errorHandler from './error_handler.js';
import { logger } from '#logger';

/**
 * Mounts errorHandler with a route that passes the given error to next. Returns the HTTP response
 * and the Express res object (for asserting on res.locals).
 */
async function sendError( error, reqAttrs = { id: 'test-request-id' } ) {
  const capture = { res: null };
  const app = express();
  app.use( ( req, res, next ) => {
    Object.assign( req, reqAttrs );
    capture.res = res;
    next( error );
  } );
  app.use( errorHandler );
  const httpRes = await request( app ).get( '/' );
  return { httpRes, res: capture.res };
}

describe( 'error_handler', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'should handle payload too large errors with 413 status', async () => {
    const error = new Error( 'request entity too large' );
    error.type = 'entity.too.large';
    error.status = 413;
    error.limit = '2mb';

    const { httpRes, res } = await sendError( error );

    expect( httpRes.status ).toBe( 413 );
    expect( httpRes.body ).toEqual( {
      error: 'Error',
      message: 'request entity too large'
    } );
    expect( res.locals.error ).toBe( error );
    expect( logger.error ).not.toHaveBeenCalled();
  } );

  it( 'should set error in res.locals for http_logger', async () => {
    const error = new Error( 'request entity too large' );
    error.type = 'entity.too.large';
    error.status = 413;
    error.limit = '2mb';

    const { httpRes, res } = await sendError( error );

    expect( res.locals.error ).toBe( error );
    expect( res.locals.error.limit ).toBe( '2mb' );
    expect( httpRes.status ).toBe( 413 );
    expect( logger.error ).not.toHaveBeenCalled();
  } );

  it( 'should log stack trace for non-payload 500 errors in non-production', async () => {
    const error = new Error( 'Something went wrong' );
    error.stack = 'Error: Something went wrong\n    at someFile.js:10:5';

    const { httpRes } = await sendError( error, { id: 'test-request-id' } );

    expect( httpRes.status ).toBe( 500 );
    expect( logger.error ).toHaveBeenCalledWith(
      'Error: Something went wrong',
      expect.objectContaining( {
        requestId: 'test-request-id',
        stack: error.stack
      } )
    );
  } );

  it( 'should not log for non-500 errors', async () => {
    const error = new WorkflowNotFoundError( 'Workflow not found' );

    const { httpRes } = await sendError( error );

    expect( httpRes.status ).toBe( 404 );
    expect( logger.error ).not.toHaveBeenCalled();
  } );

  it( 'should include workflowId in response when present on error', async () => {
    const error = new Error( 'Workflow failed' );
    error.workflowId = 'test-workflow-123';

    const { httpRes } = await sendError( error );

    expect( httpRes.status ).toBe( 500 );
    expect( httpRes.body ).toEqual( {
      error: 'Error',
      message: 'Workflow failed',
      workflowId: 'test-workflow-123'
    } );
  } );

  it( 'should not include workflowId in response when not present on error', async () => {
    const error = new Error( 'Some error' );

    const { httpRes } = await sendError( error );

    expect( httpRes.body ).toEqual( {
      error: 'Error',
      message: 'Some error'
    } );
    expect( httpRes.body.workflowId ).toBeUndefined();
  } );

  it( 'should handle CatalogNotAvailableError with 503 and Retry-After header', async () => {
    const error = new CatalogNotAvailableError( 3 );

    const { httpRes } = await sendError( error );

    expect( httpRes.status ).toBe( 503 );
    expect( httpRes.body ).toEqual( {
      error: 'CatalogNotAvailableError',
      message: 'Catalog workflow is unavailable. This is likely due the worker not running or still starting. Retry in a few seconds.',
      workflowId: undefined
    } );
    expect( httpRes.headers['retry-after'] ).toBe( '3' );
    expect( logger.error ).not.toHaveBeenCalled();
  } );

  it( 'should not set Retry-After when 503 error has no retryAfter', async () => {
    const error = new CatalogNotAvailableError();

    const { httpRes } = await sendError( error );

    expect( httpRes.status ).toBe( 503 );
    expect( httpRes.headers['retry-after'] ).toBeUndefined();
  } );

  it( 'should handle ZodError with 400 status and ValidationError response', async () => {
    const issues = [ { path: [ 'body' ], message: 'Required' } ];
    const error = new ZodError( issues );

    const { httpRes, res } = await sendError( error );

    expect( httpRes.status ).toBe( 400 );
    expect( httpRes.body ).toMatchObject( {
      error: 'ValidationError',
      message: 'Invalid Payload',
      issues
    } );
    expect( httpRes.body.workflowId ).toBeUndefined();
    expect( res.locals.error ).toBe( error );
    expect( logger.error ).not.toHaveBeenCalled();
  } );
} );
