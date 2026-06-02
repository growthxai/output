import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messageBus } from './bus.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe( 'messageBus', () => {
  beforeEach( () => {
    messageBus.removeAllListeners();
  } );

  describe( 'eventId stamping', () => {
    it( 'stamps a UUID v4 eventId on every object payload', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', { foo: 'bar' } );

      expect( handler ).toHaveBeenCalledWith( expect.objectContaining( {
        foo: 'bar',
        eventId: expect.stringMatching( UUID_V4_REGEX )
      } ) );
    } );

    it( 'gives distinct emits distinct eventIds', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', { i: 1 } );
      messageBus.emit( 'test:event', { i: 2 } );

      const first = handler.mock.calls[0][0].eventId;
      const second = handler.mock.calls[1][0].eventId;
      expect( first ).toMatch( UUID_V4_REGEX );
      expect( second ).toMatch( UUID_V4_REGEX );
      expect( first ).not.toBe( second );
    } );

    it( 'preserves a caller-supplied eventId (deterministic retry case)', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', { eventId: 'fixed-id', foo: 'bar' } );

      expect( handler ).toHaveBeenCalledWith( expect.objectContaining( {
        eventId: 'fixed-id',
        foo: 'bar'
      } ) );
    } );

    it( 'stamps eventDate on every object payload', () => {
      const handler = vi.fn();
      const now = new Date( '2026-06-02T12:00:00.000Z' );
      vi.useFakeTimers();
      vi.setSystemTime( now );
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', { foo: 'bar' } );

      expect( handler ).toHaveBeenCalledWith( expect.objectContaining( {
        eventDate: now.getTime(),
        foo: 'bar'
      } ) );

      vi.useRealTimers();
    } );

    it( 'preserves a caller-supplied eventDate', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', { eventDate: 1234, foo: 'bar' } );

      expect( handler ).toHaveBeenCalledWith( expect.objectContaining( {
        eventDate: 1234,
        foo: 'bar'
      } ) );
    } );

    it( 'does not mutate the caller-supplied payload object', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      const payload = { foo: 'bar' };
      messageBus.emit( 'test:event', payload );

      expect( payload ).not.toHaveProperty( 'eventId' );
      expect( payload ).not.toHaveProperty( 'eventDate' );
    } );
  } );

  describe( 'pass-through behavior', () => {
    it( 'passes primitive payloads through unchanged', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', 'a-string' );
      messageBus.emit( 'test:event', 42 );
      messageBus.emit( 'test:event', true );

      expect( handler ).toHaveBeenNthCalledWith( 1, 'a-string' );
      expect( handler ).toHaveBeenNthCalledWith( 2, 42 );
      expect( handler ).toHaveBeenNthCalledWith( 3, true );
    } );

    it( 'passes null and undefined payloads through unchanged', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', null );
      messageBus.emit( 'test:event' );

      expect( handler ).toHaveBeenNthCalledWith( 1, null );
      expect( handler ).toHaveBeenNthCalledWith( 2 );
    } );

    it( 'passes array payloads through unchanged (no key injection)', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', [ 1, 2, 3 ] );

      expect( handler ).toHaveBeenCalledWith( [ 1, 2, 3 ] );
    } );

    it( 'forwards additional positional args untouched', () => {
      const handler = vi.fn();
      messageBus.on( 'test:event', handler );

      messageBus.emit( 'test:event', { foo: 'bar' }, 'extra', 99 );

      expect( handler ).toHaveBeenCalledWith(
        expect.objectContaining( { foo: 'bar', eventId: expect.stringMatching( UUID_V4_REGEX ) } ),
        'extra',
        99
      );
    } );
  } );
} );
