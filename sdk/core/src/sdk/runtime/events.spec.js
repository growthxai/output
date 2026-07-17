import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitMock = vi.hoisted( () => vi.fn() );

vi.mock( '#bus', () => ( {
  stepEventBus: { emit: emitMock }
} ) );

import { Event } from './events.js';

describe( 'Event.emit', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'forwards class instance payloads unchanged', () => {
    class Payload {
      value = 'test';
    }
    const payload = new Payload();

    Event.emit( 'test:event', payload );

    expect( emitMock ).toHaveBeenCalledWith( 'sdk:test:event', payload );
  } );

  it( 'emits plain object payloads on the SDK event channel', () => {
    const payload = { modelId: 'gpt-4o' };

    Event.emit( 'cost:llm:request', payload );

    expect( emitMock ).toHaveBeenCalledWith( 'sdk:cost:llm:request', payload );
  } );

  it( 'forwards a missing payload as undefined', () => {
    Event.emit( 'lifecycle:start' );

    expect( emitMock ).toHaveBeenCalledWith( 'sdk:lifecycle:start', undefined );
  } );
} );
