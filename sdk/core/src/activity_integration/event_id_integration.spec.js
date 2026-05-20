import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messageBus } from '#bus';
import { emitEvent } from './events.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe( 'eventId integration', () => {
  beforeEach( () => {
    messageBus.removeAllListeners();
  } );

  it( 'stamps a UUID v4 eventId on every emit (end-to-end via messageBus)', () => {
    const handler = vi.fn();
    messageBus.on( 'external:cost:llm:request', handler );

    emitEvent( 'cost:llm:request', { modelId: 'gpt-4o' } );

    expect( handler ).toHaveBeenCalledWith( expect.objectContaining( {
      eventId: expect.stringMatching( UUID_V4_REGEX ),
      modelId: 'gpt-4o'
    } ) );
  } );

  it( 'cost:http:request and http:request for the same fetch get distinct eventIds', () => {
    const costHandler = vi.fn();
    const reqHandler = vi.fn();
    messageBus.on( 'external:cost:http:request', costHandler );
    messageBus.on( 'external:http:request', reqHandler );

    const sharedRequestId = 'req-xyz';
    emitEvent( 'cost:http:request', { requestId: sharedRequestId, url: 'https://x.test', cost: 1 } );
    emitEvent( 'http:request', { requestId: sharedRequestId, url: 'https://x.test', status: 200 } );

    const costEventId = costHandler.mock.calls[0][0].eventId;
    const reqEventId = reqHandler.mock.calls[0][0].eventId;
    expect( costEventId ).toMatch( UUID_V4_REGEX );
    expect( reqEventId ).toMatch( UUID_V4_REGEX );
    expect( costEventId ).not.toBe( reqEventId );
  } );

  it( 'honors a caller-supplied eventId end-to-end', () => {
    const handler = vi.fn();
    messageBus.on( 'external:custom:event', handler );

    emitEvent( 'custom:event', { eventId: 'fixed-id-123', payload: 'hi' } );

    expect( handler ).toHaveBeenCalledWith( expect.objectContaining( {
      eventId: 'fixed-id-123',
      payload: 'hi'
    } ) );
  } );
} );
