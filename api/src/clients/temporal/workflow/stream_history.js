import { isGrpcCancelledError } from '@temporalio/client';
import { temporal as temporalConfig } from '#configs';
import { WorkflowNotFoundError } from '../../errors.js';
import { decodeEventPayloads, serializeEvent } from '../../event_serialization.js';
import { EventType, EventTypeName } from '../../event_types.js';
import { WorkflowStatus, isWorkflowClosed, GrpcStatus, formatStatus } from '../types.js';

const { namespace } = temporalConfig;

const TERMINAL_EVENT_TYPES = new Set( [
  EventType.WORKFLOW_EXECUTION_COMPLETED,
  EventType.WORKFLOW_EXECUTION_FAILED,
  EventType.WORKFLOW_EXECUTION_TIMED_OUT,
  EventType.WORKFLOW_EXECUTION_CANCELED,
  EventType.WORKFLOW_EXECUTION_TERMINATED,
  EventType.WORKFLOW_EXECUTION_CONTINUED_AS_NEW
] );

// The closed set of `reason` strings a `done` chunk can carry. Both the fast-path
// (status -> event type) and the streaming path (terminal event type) resolve `reason`
// through `EventTypeName`, so derive the valid set from the same source to keep them aligned.
export const TERMINAL_REASONS = new Set(
  [ ...TERMINAL_EVENT_TYPES ].map( type => EventTypeName[type] )
);

const NEW_RUN_ID_ATTRS = {
  [EventType.WORKFLOW_EXECUTION_CONTINUED_AS_NEW]: 'workflowExecutionContinuedAsNewEventAttributes',
  [EventType.WORKFLOW_EXECUTION_COMPLETED]: 'workflowExecutionCompletedEventAttributes',
  [EventType.WORKFLOW_EXECUTION_FAILED]: 'workflowExecutionFailedEventAttributes',
  [EventType.WORKFLOW_EXECUTION_TIMED_OUT]: 'workflowExecutionTimedOutEventAttributes'
};

// Status codes are returned by `describe()`; event types are returned in history.
// Temporal uses different spellings for the two (e.g. status name `CANCELLED` vs
// event type `WORKFLOW_EXECUTION_CANCELED`), so map status code -> event type explicitly.
const STATUS_TO_TERMINAL_EVENT_TYPE = {
  [WorkflowStatus.COMPLETED]: EventType.WORKFLOW_EXECUTION_COMPLETED,
  [WorkflowStatus.FAILED]: EventType.WORKFLOW_EXECUTION_FAILED,
  [WorkflowStatus.CANCELED]: EventType.WORKFLOW_EXECUTION_CANCELED,
  [WorkflowStatus.TERMINATED]: EventType.WORKFLOW_EXECUTION_TERMINATED,
  [WorkflowStatus.CONTINUED_AS_NEW]: EventType.WORKFLOW_EXECUTION_CONTINUED_AS_NEW,
  [WorkflowStatus.TIMED_OUT]: EventType.WORKFLOW_EXECUTION_TIMED_OUT
};

// Statuses whose terminal history event can carry `newExecutionRunId`. The fast-path
// (skip history fetch when reconnect is past historyLength) cannot serve these because
// `describe()` does not expose `newExecutionRunId` -- only the terminal event does.
const STATUS_HAS_NEW_RUN_ID = new Set( [
  WorkflowStatus.COMPLETED,
  WorkflowStatus.FAILED,
  WorkflowStatus.TIMED_OUT,
  WorkflowStatus.CONTINUED_AS_NEW
] );

// Single constructor for the terminal `done` chunk so its shape lives in one place.
// `newRunId` is undefined unless the terminal event carried a follow-on run.
const doneChunk = ( reason, newRunId ) => ( { type: 'done', reason, newRunId } );

/**
 * Streams workflow history events as an async generator, long-polling Temporal for
 * new events until the workflow reaches a terminal state. Designed to back a
 * Server-Sent Events endpoint with reconnect support via `lastEventId`.
 *
 * Yields chunks of shape (the `type` discriminant matches the SSE wire event name):
 *   - `{ type: 'workflow', workflow }`              metadata, emitted once first
 *   - `{ type: 'history', events, lastEventId }`    batches of serialized events
 *   - `{ type: 'done', reason, newRunId }`          terminal state reached
 *
 * @param {{ client: import('@temporalio/client').Client, connection: import('@temporalio/client').Connection }} context
 * @param {string} workflowId
 * @param {object} options
 * @param {string} [options.runId] - Specific run to target, defaults to latest
 * @param {boolean} [options.includePayloads=false] - Decode input/output payloads
 * @param {number} [options.lastEventId] - Resume after this event id (reconnect)
 * @param {AbortSignal} [options.abortSignal] - Cancels in-flight gRPC calls
 */
export const streamHistory = async function *( { client, connection }, workflowId, options = {} ) {
  const { runId, includePayloads = false, lastEventId, abortSignal } = options ?? {};
  const handle = client.workflow.getHandle( workflowId, runId );
  const description = await connection.withAbortSignal( abortSignal, () => handle.describe() ).catch( error => {
    if ( error?.code === GrpcStatus.NOT_FOUND ) {
      throw new WorkflowNotFoundError( runId ?
        `Run "${runId}" not found for workflow "${workflowId}"` :
        `Workflow "${workflowId}" not found`
      );
    }
    error.workflowId = workflowId;
    throw error;
  } );

  const resolvedRunId = description.runId;
  if ( !resolvedRunId ) {
    throw new Error( `Temporal did not report a runId for workflow "${workflowId}"` );
  }
  const workflowStatus = description.status.code;
  const historyLength = description.historyLength;

  const workflow = {
    workflowId,
    runId: resolvedRunId,
    status: formatStatus( description.status.name ),
    startTime: description.startTime?.toISOString() ?? null,
    closeTime: description.closeTime?.toISOString() ?? null,
    historyLength,
    taskQueue: description.taskQueue
  };
  yield { type: 'workflow', workflow };

  if (
    lastEventId !== undefined &&
    isWorkflowClosed( workflowStatus ) &&
    lastEventId >= historyLength &&
    !STATUS_HAS_NEW_RUN_ID.has( workflowStatus )
  ) {
    // Fast-path: status excluded above guarantees no newRunId is possible here.
    yield doneChunk( EventTypeName[STATUS_TO_TERMINAL_EVENT_TYPE[workflowStatus]] );
    return;
  }

  const normalizeEventType = event => (
    typeof event.eventType === 'object' ?
      Number( event.eventType.toString() ) :
      event.eventType
  );
  const processEvent = event => serializeEvent(
    includePayloads ? decodeEventPayloads( event ) : event,
    { includePayloads }
  );

  const state = {
    nextPageToken: undefined,
    filterEventId: lastEventId,
    emittedAny: false,
    sawTerminalEvent: false,
    sawTerminalReason: undefined,
    sawTerminalNewRunId: undefined
  };

  // Fetch the next page; long-poll for new events only while the workflow is still
  // open (waitNewEvent), and drain already-buffered pages without blocking otherwise.
  const fetchPage = waitNewEvent => connection.withAbortSignal( abortSignal, () =>
    connection.workflowService.getWorkflowExecutionHistory( {
      namespace,
      execution: { workflowId, runId: resolvedRunId },
      maximumPageSize: 50,
      nextPageToken: state.nextPageToken,
      ...( waitNewEvent ? { waitNewEvent: true } : {} )
    } )
  ).catch( error => {
    if ( isGrpcCancelledError( error ) ) {
      return null;
    }
    throw error;
  } );

  while ( true ) {
    const response = await fetchPage( true );

    if ( response === null ) {
      return;
    }

    state.nextPageToken = response.nextPageToken?.length ? response.nextPageToken : undefined;
    const rawEvents = response.history?.events || [];

    const terminalEvent = rawEvents.find( event => TERMINAL_EVENT_TYPES.has( normalizeEventType( event ) ) );

    if ( terminalEvent && !state.sawTerminalEvent ) {
      const eventType = normalizeEventType( terminalEvent );
      const attrKey = NEW_RUN_ID_ATTRS[eventType];
      state.sawTerminalEvent = true;
      state.sawTerminalReason = EventTypeName[eventType];
      state.sawTerminalNewRunId = attrKey ? terminalEvent[attrKey]?.newExecutionRunId || undefined : undefined;
    }

    const batch = rawEvents
      .filter( event => {
        const eventId = Number( event.eventId?.toString() ?? 0 );
        return state.filterEventId === undefined || eventId > state.filterEventId;
      } )
      .map( processEvent );

    if ( batch.length > 0 ) {
      const lastSerializedId = Number( batch[batch.length - 1].eventId );
      yield { type: 'history', events: batch, lastEventId: lastSerializedId };
      // Advance the filter to the last delivered id (high-water mark) rather than
      // clearing it. An empty long-poll can reset nextPageToken to undefined, making
      // the next fetch re-read history from the start; keeping the filter armed at the
      // last emitted id prevents re-emitting events the client already received.
      state.filterEventId = lastSerializedId;
      state.emittedAny = true;
    }

    // Replay complete: all pages drained, terminal event was already seen by the
    // client (reconnect cursor past it), so nothing new was emitted this stream.
    if ( !state.nextPageToken && !state.emittedAny && state.sawTerminalEvent ) {
      yield doneChunk( state.sawTerminalReason, state.sawTerminalNewRunId );
      return;
    }

    if ( terminalEvent ) {
      while ( state.nextPageToken ) {
        const drainResponse = await fetchPage( false );

        if ( drainResponse === null ) {
          return;
        }

        state.nextPageToken = drainResponse.nextPageToken?.length ? drainResponse.nextPageToken : undefined;
        const drainEvents = drainResponse.history?.events || [];
        if ( drainEvents.length > 0 ) {
          const drainBatch = drainEvents.map( processEvent );
          const drainLastId = Number( drainBatch[drainBatch.length - 1].eventId );
          yield { type: 'history', events: drainBatch, lastEventId: drainLastId };
        }
      }

      yield doneChunk( state.sawTerminalReason, state.sawTerminalNewRunId );
      return;
    }
  }
};
