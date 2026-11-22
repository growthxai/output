import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { historyToJSON } from '@temporalio/common/lib/proto-utils.js';
import proto from '@temporalio/proto';
import { isDurationKey, isTimestampKey, serializeHistoryEvent } from './history_serializer.js';

const fixturesDir = join( dirname( fileURLToPath( import.meta.url ) ), 'fixtures/history' );

const readJson = ( name: string ): unknown => JSON.parse( readFileSync( join( fixturesDir, name ), 'utf8' ) );

const listGoldenCases = (): string[] => [ ...new Set(
  readdirSync( fixturesDir )
    .filter( name => name.endsWith( '.input.json' ) )
    .map( name => name.replace( /\.input\.json$/, '' ) )
) ].sort();

/** Builds protobuf history events from plain objects, as Temporal's own decode would produce them */
const buildHistoryEvents = ( rawEvents: object[] ) => {
  const history = proto.temporal.api.history.v1.History.fromObject( { events: rawEvents } );
  return history.events ?? [];
};

const serializeWithTemporal = ( events: object[] ): object[] => {
  const parsed = JSON.parse( historyToJSON( { events } ) ) as { events?: object[] };
  return parsed.events ?? [];
};

interface ProtoType {
  fullName?: string;
  fieldsArray?: ProtoField[];
}

interface ProtoField {
  name: string;
  resolve: () => ProtoField;
  resolvedType?: ProtoType | null;
}

/** Collects every Duration/Timestamp field name reachable from a protobuf message type */
const collectWktFieldNames = ( type: ProtoType, seen = new Set<string>() ): { duration: string[]; timestamp: string[] } => {
  if ( !type.fullName || seen.has( type.fullName ) ) {
    return { duration: [], timestamp: [] };
  }
  seen.add( type.fullName );

  const duration: string[] = [];
  const timestamp: string[] = [];
  for ( const field of type.fieldsArray ?? [] ) {
    const resolved = field.resolve();
    const nested = resolved.resolvedType;
    if ( !nested?.fullName ) {
      continue;
    }
    if ( nested.fullName === '.google.protobuf.Duration' ) {
      duration.push( resolved.name );
      continue;
    }
    if ( nested.fullName === '.google.protobuf.Timestamp' ) {
      timestamp.push( resolved.name );
      continue;
    }
    const nestedNames = collectWktFieldNames( nested, seen );
    duration.push( ...nestedNames.duration );
    timestamp.push( ...nestedNames.timestamp );
  }
  return { duration, timestamp };
};

describe( 'history serializer contract', () => {
  describe( 'WKT field-name predicates', () => {
    it( 'recognize every Duration and Timestamp field under HistoryEvent', () => {
      const root = proto.temporal.api.history.v1.HistoryEvent as unknown as ProtoType;
      const { duration, timestamp } = collectWktFieldNames( root );

      expect( duration.length ).toBeGreaterThan( 0 );
      expect( timestamp.length ).toBeGreaterThan( 0 );
      expect( duration.filter( name => !isDurationKey( name ) ) ).toEqual( [] );
      expect( timestamp.filter( name => !isTimestampKey( name ) ) ).toEqual( [] );
    } );
  } );

  describe( 'golden fixtures', () => {
    it.each( listGoldenCases() )( '%s matches the committed Temporal-tool JSON', name => {
      const input = readJson( `${name}.input.json` );
      const expected = readJson( `${name}.expected.json` );

      expect( serializeHistoryEvent( input ) ).toEqual( expected );
    } );
  } );

  describe( 'oracle vs historyToJSON', () => {
    it( 'matches Temporal for timer, activity, failure and child events', () => {
      const rawEvents = [
        {
          eventId: 1,
          eventTime: { seconds: 10, nanos: 500_000_000 },
          eventType: 'EVENT_TYPE_TIMER_FIRED',
          timerFiredEventAttributes: { timerId: 'timer-1', startedEventId: 3 }
        },
        {
          eventId: 2,
          eventTime: { seconds: 11 },
          eventType: 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED',
          activityTaskScheduledEventAttributes: {
            activityId: 'step-1',
            activityType: { name: 'do_work' },
            taskQueue: { name: 'default' },
            input: {
              payloads: [ {
                metadata: { encoding: Buffer.from( 'json/plain' ) },
                data: Buffer.from( '{"a":1}' )
              } ]
            },
            scheduleToCloseTimeout: { seconds: 60 },
            startToCloseTimeout: { seconds: 30, nanos: 500_000_000 },
            heartbeatTimeout: {},
            workflowTaskCompletedEventId: 1
          }
        },
        {
          eventId: 3,
          eventTime: { seconds: 12 },
          eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_FAILED',
          workflowExecutionFailedEventAttributes: {
            failure: {
              message: 'boom',
              stackTrace: 'Error: boom\n    at step (workflow.js:1:1)',
              applicationFailureInfo: { type: 'Error', nonRetryable: true }
            },
            retryState: 'RETRY_STATE_NON_RETRYABLE_FAILURE',
            workflowTaskCompletedEventId: 2
          }
        },
        {
          eventId: 4,
          eventTime: { seconds: 13, nanos: 250_000_000 },
          eventType: 'EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED',
          childWorkflowExecutionStartedEventAttributes: {
            namespace: 'default',
            initiatedEventId: 2,
            workflowExecution: { workflowId: 'wf-child-1', runId: 'run-child-1' },
            workflowType: { name: 'child_workflow' }
          }
        }
      ];

      const events = buildHistoryEvents( rawEvents );

      expect( events.map( event => serializeHistoryEvent( event ) ) ).toEqual( serializeWithTemporal( events ) );
    } );

    it( 'matches Temporal for each golden input after History.fromObject', () => {
      for ( const name of listGoldenCases() ) {
        const input = readJson( `${name}.input.json` ) as object;
        const events = buildHistoryEvents( [ input ] );

        expect( events.map( event => serializeHistoryEvent( event ) ), name )
          .toEqual( serializeWithTemporal( events ) );
      }
    } );
  } );
} );
