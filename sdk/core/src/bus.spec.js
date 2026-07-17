import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const loadMock = vi.hoisted( () => vi.fn() );

vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

import { mainEventBus, stepEventBus } from './bus.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVITY_CONTEXT = {
  activityInfo: { activityId: 'activity-id' },
  workflowDetails: { workflowId: 'workflow-id' },
  outputActivityKind: 'step'
};

describe( 'event buses', () => {
  beforeEach( () => {
    mainEventBus.removeAllListeners();
    stepEventBus.removeAllListeners();
    loadMock.mockReset();
  } );

  afterEach( () => {
    vi.useRealTimers();
  } );

  describe( 'mainEventBus', () => {
    it( 'adds event metadata to payload fields', () => {
      const handler = vi.fn();
      const now = new Date( '2026-06-02T12:00:00.000Z' );
      vi.useFakeTimers();
      vi.setSystemTime( now );
      mainEventBus.on( 'test:event', handler );

      mainEventBus.emit( 'test:event', { foo: 'bar' } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: expect.stringMatching( UUID_V4_REGEX ),
        eventDate: now.getTime(),
        foo: 'bar'
      } );
    } );

    it( 'preserves caller-supplied event metadata', () => {
      const handler = vi.fn();
      mainEventBus.on( 'test:event', handler );

      mainEventBus.emit( 'test:event', { eventId: 'fixed-id', eventDate: 1234 } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: 'fixed-id',
        eventDate: 1234
      } );
    } );

    it( 'does not mutate the caller-supplied payload', () => {
      const handler = vi.fn();
      const payload = { foo: 'bar' };
      mainEventBus.on( 'test:event', handler );

      mainEventBus.emit( 'test:event', payload );

      expect( handler.mock.calls[0][0] ).not.toBe( payload );
      expect( payload ).toEqual( { foo: 'bar' } );
    } );

    it( 'does not attach activity context', () => {
      const handler = vi.fn();
      loadMock.mockReturnValue( {
        activityInfo: { activityId: 'activity-id' },
        workflowDetails: { workflowId: 'workflow-id' },
        outputActivityKind: 'step'
      } );
      mainEventBus.on( 'test:event', handler );

      mainEventBus.emit( 'test:event', { foo: 'bar' } );

      expect( handler ).toHaveBeenCalledWith( expect.not.objectContaining( {
        activityInfo: expect.anything(),
        workflowDetails: expect.anything(),
        outputActivityKind: expect.anything()
      } ) );
      expect( loadMock ).not.toHaveBeenCalled();
    } );

    it( 'filters catalog workflow events', () => {
      const handler = vi.fn();
      mainEventBus.on( 'workflow:start', handler );

      const emitted = mainEventBus.emit( 'workflow:start', {
        workflowDetails: { workflowType: '$catalog' }
      } );

      expect( emitted ).toBe( false );
      expect( handler ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'stepEventBus', () => {
    beforeEach( () => {
      loadMock.mockReturnValue( ACTIVITY_CONTEXT );
    } );

    it( 'wraps payloads with event metadata and activity context', () => {
      const handler = vi.fn();
      const payload = { foo: 'bar' };
      stepEventBus.on( 'test:event', handler );

      stepEventBus.emit( 'test:event', payload );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: expect.stringMatching( UUID_V4_REGEX ),
        eventDate: expect.any( Number ),
        ...ACTIVITY_CONTEXT,
        payload
      } );
    } );

    it( 'omits activity fields outside activity context', () => {
      const handler = vi.fn();
      loadMock.mockReturnValue( undefined );
      stepEventBus.on( 'test:event', handler );

      stepEventBus.emit( 'test:event', { foo: 'bar' } );

      expect( handler ).toHaveBeenCalledWith( {
        eventId: expect.stringMatching( UUID_V4_REGEX ),
        eventDate: expect.any( Number ),
        payload: { foo: 'bar' }
      } );
    } );

    it( 'preserves arbitrary payloads unchanged inside the envelope', () => {
      const handler = vi.fn();
      const array = [ 1, 2, 3 ];
      const instance = new Date();
      stepEventBus.on( 'test:event', handler );

      stepEventBus.emit( 'test:event', 'value' );
      stepEventBus.emit( 'test:event', array );
      stepEventBus.emit( 'test:event', instance );
      stepEventBus.emit( 'test:event' );

      expect( handler.mock.calls[0][0].payload ).toBe( 'value' );
      expect( handler.mock.calls[1][0].payload ).toBe( array );
      expect( handler.mock.calls[2][0].payload ).toBe( instance );
      expect( handler.mock.calls[3][0] ).toHaveProperty( 'payload', undefined );
    } );

    it( 'keeps payload metadata separate from envelope metadata', () => {
      const handler = vi.fn();
      const payload = { eventId: 'payload-id', eventDate: 1234 };
      stepEventBus.on( 'test:event', handler );

      stepEventBus.emit( 'test:event', payload );

      const envelope = handler.mock.calls[0][0];
      expect( envelope.eventId ).toMatch( UUID_V4_REGEX );
      expect( envelope.eventId ).not.toBe( payload.eventId );
      expect( envelope.eventDate ).not.toBe( payload.eventDate );
      expect( envelope.payload ).toBe( payload );
    } );

    it( 'gives distinct emits distinct eventIds', () => {
      const handler = vi.fn();
      stepEventBus.on( 'test:event', handler );

      stepEventBus.emit( 'test:event', { i: 1 } );
      stepEventBus.emit( 'test:event', { i: 2 } );

      const first = handler.mock.calls[0][0].eventId;
      const second = handler.mock.calls[1][0].eventId;
      expect( first ).toMatch( UUID_V4_REGEX );
      expect( second ).toMatch( UUID_V4_REGEX );
      expect( first ).not.toBe( second );
    } );

    it( 'forwards additional positional arguments unchanged', () => {
      const handler = vi.fn();
      stepEventBus.on( 'test:event', handler );

      stepEventBus.emit( 'test:event', { foo: 'bar' }, 'extra', 99 );

      expect( handler ).toHaveBeenCalledWith(
        expect.objectContaining( {
          eventId: expect.stringMatching( UUID_V4_REGEX ),
          payload: { foo: 'bar' }
        } ),
        'extra',
        99
      );
    } );
  } );
} );
