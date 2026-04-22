import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeEventPayloads, serializeEvent } from './event_serialization.js';

const { mockLoggerWarn } = vi.hoisted( () => ( {
  mockLoggerWarn: vi.fn()
} ) );

vi.mock( '@temporalio/client', () => ( {
  defaultPayloadConverter: {
    fromPayload: vi.fn( p => p )
  }
} ) );

vi.mock( '#logger', () => ( {
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: mockLoggerWarn
  }
} ) );

describe( 'event_serialization', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'decodeEventPayloads', () => {
    it( 'decodes activity scheduled input payloads', () => {
      const event = {
        activityTaskScheduledEventAttributes: {
          activityType: { name: 'wf#myStep' },
          input: { payloads: [ { data: 'test-input' } ] }
        }
      };
      const result = decodeEventPayloads( event );
      expect( result.activityTaskScheduledEventAttributes.input ).toEqual( [ { data: 'test-input' } ] );
    } );

    it( 'decodes activity completed result payloads', () => {
      const event = {
        activityTaskCompletedEventAttributes: {
          scheduledEventId: { toString: () => '5' },
          result: { payloads: [ { output: 'done' } ] }
        }
      };
      const result = decodeEventPayloads( event );
      expect( result.activityTaskCompletedEventAttributes.result ).toEqual( [ { output: 'done' } ] );
    } );

    it( 'extracts failure message and stackTrace', () => {
      const event = {
        activityTaskFailedEventAttributes: {
          scheduledEventId: { toString: () => '5' },
          failure: {
            message: 'step failed',
            stackTrace: 'Error at line 1',
            failureInfo: { applicationFailureInfo: { type: 'AppError' } }
          }
        }
      };
      const result = decodeEventPayloads( event );
      expect( result.activityTaskFailedEventAttributes.failure ).toEqual( {
        message: 'step failed',
        stackTrace: 'Error at line 1',
        type: 'AppError'
      } );
    } );

    it( 'passes through events without payload fields unchanged', () => {
      const event = {
        activityTaskStartedEventAttributes: {
          scheduledEventId: { toString: () => '5' }
        }
      };
      const result = decodeEventPayloads( event );
      expect( result ).toBe( event );
    } );

    it( 'handles decode failures with fallback representation and warns', async () => {
      const { defaultPayloadConverter } = await import( '@temporalio/client' );
      defaultPayloadConverter.fromPayload.mockImplementationOnce( () => {
        throw new Error( 'decode failed' );
      } );
      const event = {
        eventId: { toString: () => '42' },
        activityTaskScheduledEventAttributes: {
          input: {
            payloads: [ { metadata: { encoding: Buffer.from( 'binary/plain' ) } } ]
          }
        }
      };
      const result = decodeEventPayloads( event );
      expect( result.activityTaskScheduledEventAttributes.input ).toEqual( [
        { _raw: true, encoding: 'binary/plain' }
      ] );
      expect( mockLoggerWarn ).toHaveBeenCalledWith( 'Failed to decode event payload',
        expect.objectContaining( { eventId: '42', encoding: 'binary/plain', error: 'decode failed' } ) );
    } );
  } );

  describe( 'serializeEvent', () => {
    it( 'converts Long eventId to string', () => {
      const event = {
        eventId: { toString: () => '42' },
        eventType: 1,
        eventTime: null
      };
      const result = serializeEvent( event );
      expect( result.eventId ).toBe( '42' );
    } );

    it( 'maps eventType to eventTypeName', () => {
      const event = {
        eventId: { toString: () => '1' },
        eventType: 10,
        eventTime: null,
        activityTaskScheduledEventAttributes: {
          activityType: { name: 'wf#myStep' }
        }
      };
      const result = serializeEvent( event );
      expect( result.eventTypeName ).toBe( 'ACTIVITY_TASK_SCHEDULED' );
    } );

    it( 'converts Timestamp to ISO 8601 string', () => {
      const event = {
        eventId: { toString: () => '1' },
        eventType: 1,
        eventTime: { seconds: { toString: () => '1713182400' }, nanos: 500000000 }
      };
      const result = serializeEvent( event );
      expect( result.eventTime ).toBe( '2024-04-15T12:00:00.500Z' );
    } );

    it( 'extracts stepName from activityType.name', () => {
      const event = {
        eventId: { toString: () => '5' },
        eventType: 10,
        eventTime: null,
        activityTaskScheduledEventAttributes: {
          activityType: { name: 'fact-checker#extractPassages' }
        }
      };
      const result = serializeEvent( event );
      expect( result.activityTaskScheduledEventAttributes.stepName ).toBe( 'extractPassages' );
    } );

    it( 'falls back to full activity name when # is absent', () => {
      const event = {
        eventId: { toString: () => '5' },
        eventType: 10,
        eventTime: null,
        activityTaskScheduledEventAttributes: {
          activityType: { name: 'plainActivity' }
        }
      };
      const result = serializeEvent( event );
      expect( result.activityTaskScheduledEventAttributes.stepName ).toBe( 'plainActivity' );
    } );

    it( 'converts scheduledEventId Long to string', () => {
      const event = {
        eventId: { toString: () => '7' },
        eventType: 12,
        eventTime: null,
        activityTaskCompletedEventAttributes: {
          scheduledEventId: { toString: () => '5' },
          result: [ 'data' ]
        }
      };
      const result = serializeEvent( event );
      expect( result.activityTaskCompletedEventAttributes.scheduledEventId ).toBe( '5' );
    } );

    it( 'strips payloads when includePayloads is false', () => {
      const event = {
        eventId: { toString: () => '5' },
        eventType: 10,
        eventTime: null,
        activityTaskScheduledEventAttributes: {
          activityType: { name: 'wf#myStep' },
          input: [ 'decoded-input' ]
        }
      };
      const result = serializeEvent( event, { includePayloads: false } );
      expect( result.activityTaskScheduledEventAttributes.input ).toBeUndefined();
      expect( result.activityTaskScheduledEventAttributes.activityType ).toBeDefined();
    } );

    it( 'preserves payloads when includePayloads is true', () => {
      const event = {
        eventId: { toString: () => '5' },
        eventType: 10,
        eventTime: null,
        activityTaskScheduledEventAttributes: {
          activityType: { name: 'wf#myStep' },
          input: [ 'decoded-input' ]
        }
      };
      const result = serializeEvent( event, { includePayloads: true } );
      expect( result.activityTaskScheduledEventAttributes.input ).toEqual( [ 'decoded-input' ] );
    } );

    it( 'strips result and failure when includePayloads is false', () => {
      const completed = {
        eventId: { toString: () => '7' },
        eventType: 12,
        eventTime: null,
        activityTaskCompletedEventAttributes: { result: [ 'decoded-result' ] }
      };
      const failed = {
        eventId: { toString: () => '8' },
        eventType: 13,
        eventTime: null,
        activityTaskFailedEventAttributes: { failure: { message: 'boom' } }
      };

      expect( serializeEvent( completed, { includePayloads: false } )
        .activityTaskCompletedEventAttributes.result ).toBeUndefined();
      expect( serializeEvent( failed, { includePayloads: false } )
        .activityTaskFailedEventAttributes.failure ).toBeUndefined();
    } );

    it( 'strips details and lastCompletionResult when includePayloads is false', () => {
      const marker = {
        eventId: { toString: () => '9' },
        eventType: 9,
        eventTime: null,
        markerRecordedEventAttributes: {
          markerName: 'LocalActivity',
          details: { data: [ 'local-activity-result' ] }
        }
      };
      const continued = {
        eventId: { toString: () => '10' },
        eventType: 6,
        eventTime: null,
        workflowExecutionContinuedAsNewEventAttributes: {
          newExecutionRunId: 'new-run',
          lastCompletionResult: [ 'prev-result' ],
          lastFailure: { message: 'prev-failure' }
        }
      };

      const markerResult = serializeEvent( marker, { includePayloads: false } );
      expect( markerResult.markerRecordedEventAttributes.details ).toBeUndefined();
      expect( markerResult.markerRecordedEventAttributes.markerName ).toBe( 'LocalActivity' );

      const continuedResult = serializeEvent( continued, { includePayloads: false } );
      expect( continuedResult.workflowExecutionContinuedAsNewEventAttributes.lastCompletionResult ).toBeUndefined();
      expect( continuedResult.workflowExecutionContinuedAsNewEventAttributes.lastFailure ).toBeUndefined();
      expect( continuedResult.workflowExecutionContinuedAsNewEventAttributes.newExecutionRunId ).toBe( 'new-run' );
    } );

    it( 'drops attrs for unknown eventType when includePayloads is false', () => {
      const event = {
        eventId: { toString: () => '1' },
        eventType: 9999,
        eventTime: null,
        unknownFutureEventAttributes: { input: 'leaked-input', details: 'leaked-details' }
      };
      const result = serializeEvent( event, { includePayloads: false } );
      expect( result.eventTypeName ).toBe( 'UNKNOWN_9999' );
      expect( result.unknownFutureEventAttributes ).toBeUndefined();
    } );

    it( 'warns only once per unknown eventType within a process', () => {
      const eventA = { eventId: { toString: () => '1' }, eventType: 8881, eventTime: null };
      const eventB = { eventId: { toString: () => '2' }, eventType: 8881, eventTime: null };
      const eventC = { eventId: { toString: () => '3' }, eventType: 8882, eventTime: null };
      mockLoggerWarn.mockClear();

      serializeEvent( eventA );
      serializeEvent( eventB );
      serializeEvent( eventC );

      const unknownWarnCalls = mockLoggerWarn.mock.calls.filter(
        ( [ msg ] ) => msg === 'Unknown Temporal event type encountered'
      );
      expect( unknownWarnCalls ).toHaveLength( 2 );
      expect( unknownWarnCalls[0][1] ).toEqual( { eventType: 8881 } );
      expect( unknownWarnCalls[1][1] ).toEqual( { eventType: 8882 } );
    } );

    it( 'keeps attrs for unknown eventType when includePayloads is true', () => {
      const event = {
        eventId: { toString: () => '1' },
        eventType: 9999,
        eventTime: null,
        unknownFutureEventAttributes: { input: 'included-input' }
      };
      const result = serializeEvent( event, { includePayloads: true } );
      expect( result.unknownFutureEventAttributes.input ).toBe( 'included-input' );
    } );

    it( 'returns UNKNOWN for unmapped eventType values', () => {
      const event = {
        eventId: { toString: () => '1' },
        eventType: 999,
        eventTime: null
      };
      const result = serializeEvent( event );
      expect( result.eventTypeName ).toBe( 'UNKNOWN_999' );
    } );
  } );
} );
