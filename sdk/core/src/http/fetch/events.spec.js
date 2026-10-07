import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock( '#bus', () => ( {
  stepEventBus: {
    emit: vi.fn()
  }
} ) );

import { stepEventBus } from '#bus';
import { emitError, emitFailure, emitSuccess } from './events.js';

const bus = vi.mocked( stepEventBus, true );

beforeEach( () => {
  bus.emit.mockClear();
} );

describe( 'instrumented_fetch/events', () => {
  it( 'emits a successful request', async () => {
    await emitSuccess( {
      requestId: 'request-success',
      method: 'GET',
      url: 'https://example.com/success',
      status: 200,
      durationMs: 12
    } );

    expect( bus.emit ).toHaveBeenCalledWith( 'sdk:http:request', {
      requestId: 'request-success',
      method: 'GET',
      url: 'https://example.com/success',
      status: 200,
      durationMs: 12,
      outcome: 'success'
    } );
  } );

  it( 'emits an HTTP error', async () => {
    await emitError( {
      requestId: 'request-error',
      method: 'POST',
      url: 'https://example.com/error',
      status: 503,
      durationMs: 23
    } );

    expect( bus.emit ).toHaveBeenCalledWith( 'sdk:http:request', {
      requestId: 'request-error',
      method: 'POST',
      url: 'https://example.com/error',
      status: 503,
      durationMs: 23,
      outcome: 'error'
    } );
  } );

  it( 'emits a transport failure without a status', () => {
    emitFailure( {
      requestId: 'request-failure',
      method: 'DELETE',
      url: 'https://example.com/failure',
      durationMs: 34
    } );

    expect( bus.emit ).toHaveBeenCalledWith( 'sdk:http:request', {
      requestId: 'request-failure',
      method: 'DELETE',
      url: 'https://example.com/failure',
      status: undefined,
      durationMs: 34,
      outcome: 'failure'
    } );
  } );
} );
