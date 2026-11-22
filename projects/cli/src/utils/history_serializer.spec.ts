import { describe, expect, it } from 'vitest';
import { serializeHistoryEvent } from './history_serializer.js';

describe( 'serializeHistoryEvent', () => {
  it( 'turns Timestamp fields into RFC 3339 UTC strings', () => {
    expect( serializeHistoryEvent( {
      eventId: '1',
      eventTime: { seconds: '10', nanos: 500_000_000 },
      eventType: 'EVENT_TYPE_TIMER_FIRED'
    } ) ).toEqual( {
      eventId: '1',
      eventTime: '1970-01-01T00:00:10.500Z',
      eventType: 'EVENT_TYPE_TIMER_FIRED'
    } );
  } );

  it( 'drops the fractional second when nanos are zero', () => {
    expect( serializeHistoryEvent( {
      eventTime: { seconds: 11 }
    } ).eventTime ).toBe( '1970-01-01T00:00:11Z' );
  } );

  it( 'turns Duration fields into seconds strings', () => {
    expect( serializeHistoryEvent( {
      activityTaskScheduledEventAttributes: {
        scheduleToCloseTimeout: { seconds: '60' },
        startToCloseTimeout: { seconds: 30, nanos: 500_000_000 },
        heartbeatTimeout: {}
      }
    } ) ).toEqual( {
      activityTaskScheduledEventAttributes: {
        scheduleToCloseTimeout: '60s',
        startToCloseTimeout: '30.500s',
        heartbeatTimeout: '0s'
      }
    } );
  } );

  it( 'keeps negative durations signed', () => {
    expect( serializeHistoryEvent( {
      backoffInterval: { seconds: -2, nanos: -500_000_000 }
    } ).backoffInterval ).toBe( '-2.500s' );
  } );

  it( 'stringifies int64 event ids left as numbers in plain fixtures', () => {
    expect( serializeHistoryEvent( {
      eventId: 7,
      activityTaskCompletedEventAttributes: { scheduledEventId: 3, startedEventId: 4 }
    } ) ).toEqual( {
      eventId: '7',
      activityTaskCompletedEventAttributes: { scheduledEventId: '3', startedEventId: '4' }
    } );
  } );

  it( 'leaves payloads and other nested objects unchanged aside from WKT fields', () => {
    const event = {
      eventId: '2',
      eventTime: { seconds: '12' },
      activityTaskScheduledEventAttributes: {
        activityId: '5',
        input: {
          payloads: [ {
            metadata: { encoding: 'anNvbi9wbGFpbg==' },
            data: 'eyJhIjoxfQ=='
          } ]
        },
        startToCloseTimeout: { seconds: '30' }
      }
    };

    expect( serializeHistoryEvent( event ) ).toEqual( {
      eventId: '2',
      eventTime: '1970-01-01T00:00:12Z',
      activityTaskScheduledEventAttributes: {
        activityId: '5',
        input: {
          payloads: [ {
            metadata: { encoding: 'anNvbi9wbGFpbg==' },
            data: 'eyJhIjoxfQ=='
          } ]
        },
        startToCloseTimeout: '30s'
      }
    } );
  } );

  it( 'does not mutate the input', () => {
    const event = {
      eventTime: { seconds: '1', nanos: 0 },
      nested: { startToCloseTimeout: { seconds: '5' } }
    };
    const before = structuredClone( event );

    serializeHistoryEvent( event );

    expect( event ).toEqual( before );
  } );

  it( 'uses Message.toJSON when present, then applies WKT conversion', () => {
    const event = {
      toJSON: () => ( {
        eventId: '9',
        eventTime: { seconds: '3' },
        startToCloseTimeout: { seconds: '1' }
      } )
    };

    expect( serializeHistoryEvent( event ) ).toEqual( {
      eventId: '9',
      eventTime: '1970-01-01T00:00:03Z',
      startToCloseTimeout: '1s'
    } );
  } );

  it( 'walks arrays without treating the parent key as a WKT field on items that are not seconds/nanos', () => {
    expect( serializeHistoryEvent( {
      pendingActivities: [ { activityId: '1', lastHeartbeatTime: { seconds: '4' } } ]
    } ) ).toEqual( {
      pendingActivities: [ { activityId: '1', lastHeartbeatTime: '1970-01-01T00:00:04Z' } ]
    } );
  } );

  it( 'rejects non-object events', () => {
    expect( () => serializeHistoryEvent( null ) ).toThrow( /History event must be an object/ );
    expect( () => serializeHistoryEvent( 'nope' ) ).toThrow( /History event must be an object/ );
  } );
} );
