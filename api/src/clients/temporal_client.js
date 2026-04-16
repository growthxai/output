import { Client, Connection, defaultPayloadConverter } from '@temporalio/client';
import { temporal as temporalConfig } from '#configs';
import { buildWorkflowId, extractTraceInfo, extractErrorMessage, takeFromAsyncIterable } from '#utils';
import { logger } from '#logger';
import {
  WorkflowNotFoundError,
  WorkflowFailedError,
  WorkflowExecutionTimedOutError,
  WorkflowNotCompletedError,
  CatalogNotAvailableError,
  StepNotFoundError,
  StepNotCompletedError,
  InvalidPageTokenError
} from './errors.js';

const { address, apiKey, namespace, defaultTaskQueue, workflowExecutionTimeout, workflowExecutionMaxWaiting } = temporalConfig;

/**
 * Returns the catalog object from the catalog workflow
 *
 * @param {Client} client
 * @returns {object}
 * @throws {CatalogNotAvailableError}
 * @throws {Error}
 */
const getCatalog = async ( { client, taskQueue } ) => {
  const catalogHandle = client.workflow.getHandle( taskQueue );
  try {
    return await catalogHandle.query( 'get' );
  } catch ( error ) {
    if ( error instanceof WorkflowNotFoundError ) {
      throw new CatalogNotAvailableError( 3 );
    }
    throw error;
  }
};

/**
 * Map Temporal workflow execution status to user-friendly string
 * @param {string} statusName - The Temporal status name (e.g., 'RUNNING', 'COMPLETED')
 * @returns {string} User-friendly status string
 */
const mapWorkflowStatus = statusName => {
  const statusMap = {
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELED: 'canceled',
    TERMINATED: 'terminated',
    TIMED_OUT: 'timed_out',
    CONTINUED_AS_NEW: 'continued'
  };
  return statusMap[statusName] || statusName.toLowerCase();
};

/**
 * Terminal Temporal workflow execution status codes.
 * Values correspond to temporal.api.enums.v1.WorkflowExecutionStatus protobuf enum.
 */
const TemporalStatus = {
  COMPLETED: 2,
  FAILED: 3,
  CANCELED: 4,
  TERMINATED: 5,
  CONTINUED_AS_NEW: 6,
  TIMED_OUT: 7
};

const TERMINAL_STATUS_CODES = new Set( Object.values( TemporalStatus ) );

// Values correspond to temporal.api.enums.v1.EventType protobuf enum.
const EventType = {
  WORKFLOW_EXECUTION_STARTED: 1,
  WORKFLOW_EXECUTION_COMPLETED: 2,
  WORKFLOW_EXECUTION_FAILED: 3,
  WORKFLOW_EXECUTION_TIMED_OUT: 4,
  WORKFLOW_TASK_SCHEDULED: 5,
  WORKFLOW_TASK_STARTED: 6,
  WORKFLOW_TASK_COMPLETED: 7,
  WORKFLOW_TASK_TIMED_OUT: 8,
  WORKFLOW_TASK_FAILED: 9,
  ACTIVITY_TASK_SCHEDULED: 10,
  ACTIVITY_TASK_STARTED: 11,
  ACTIVITY_TASK_COMPLETED: 12,
  ACTIVITY_TASK_FAILED: 13,
  ACTIVITY_TASK_TIMED_OUT: 14,
  ACTIVITY_TASK_CANCEL_REQUESTED: 15,
  ACTIVITY_TASK_CANCELED: 16,
  TIMER_STARTED: 17,
  TIMER_FIRED: 18,
  TIMER_CANCELED: 19,
  WORKFLOW_EXECUTION_CANCEL_REQUESTED: 20,
  WORKFLOW_EXECUTION_CANCELED: 21,
  WORKFLOW_EXECUTION_SIGNALED: 26,
  WORKFLOW_EXECUTION_TERMINATED: 27,
  WORKFLOW_EXECUTION_CONTINUED_AS_NEW: 28,
  START_CHILD_WORKFLOW_EXECUTION_INITIATED: 29,
  CHILD_WORKFLOW_EXECUTION_STARTED: 31,
  CHILD_WORKFLOW_EXECUTION_COMPLETED: 32,
  CHILD_WORKFLOW_EXECUTION_FAILED: 33,
  CHILD_WORKFLOW_EXECUTION_CANCELED: 34,
  CHILD_WORKFLOW_EXECUTION_TIMED_OUT: 35,
  CHILD_WORKFLOW_EXECUTION_TERMINATED: 36,
  MARKER_RECORDED: 25
};

const EventTypeName = Object.fromEntries(
  Object.entries( EventType ).map( ( [ name, value ] ) => [ value, name ] )
);

const warnedUnknownEventTypes = new Set();

// Subset of gRPC status codes from @grpc/grpc-js (transitive through @temporalio/client).
// See https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
const GRPC_STATUS = { INVALID_ARGUMENT: 3, NOT_FOUND: 5 };

const toNumberSafe = v => {
  if ( v === null || v === undefined ) {
    return 0;
  }
  return typeof v === 'object' && typeof v.toString === 'function' ? Number( v.toString() ) : Number( v );
};

const serializeEventTime = eventTime => {
  if ( eventTime?.seconds === null || eventTime?.seconds === undefined ) {
    return null;
  }
  const seconds = toNumberSafe( eventTime.seconds );
  const nanos = toNumberSafe( eventTime.nanos );
  if ( !Number.isFinite( seconds ) || !Number.isFinite( nanos ) ) {
    return null;
  }
  return new Date( ( seconds * 1000 ) + Math.floor( nanos / 1e6 ) ).toISOString();
};

/**
 * Resolve a step name to the WORKFLOW_TASK_COMPLETED event ID to reset to.
 * Scans the workflow history to find the activity matching the step, then locates
 * the workflow task completed event immediately after that activity finished.
 *
 * @param {Array} events - Workflow history events
 * @param {string} stepName - The step name to find (e.g., "consolidateCompetitors")
 * @returns {Long} The event ID of the WORKFLOW_TASK_COMPLETED event to reset to
 * @throws {StepNotFoundError}
 * @throws {StepNotCompletedError}
 */
export const resolveResetEventId = ( events, stepName ) => {
  const suffix = `#${stepName}`;

  // Find the last ActivityTaskScheduled event matching the step name
  const scheduledEvent = events.findLast( event =>
    event.eventType === EventType.ACTIVITY_TASK_SCHEDULED &&
    event.activityTaskScheduledEventAttributes?.activityType?.name?.endsWith( suffix )
  );

  if ( !scheduledEvent ) {
    throw new StepNotFoundError( stepName );
  }

  const scheduledId = scheduledEvent.eventId.toString();

  // Find the corresponding ActivityTaskCompleted event
  const completedEvent = events.findLast( event =>
    event.eventType === EventType.ACTIVITY_TASK_COMPLETED &&
    event.activityTaskCompletedEventAttributes?.scheduledEventId?.toString() === scheduledId
  );

  if ( !completedEvent ) {
    throw new StepNotCompletedError( stepName );
  }

  const completedId = Number( completedEvent.eventId.toString() );

  // Find the next WORKFLOW_TASK_COMPLETED event after the activity completed
  const resetEvent = events.find( event =>
    event.eventType === EventType.WORKFLOW_TASK_COMPLETED &&
    Number( event.eventId.toString() ) > completedId
  );

  if ( !resetEvent ) {
    throw new StepNotCompletedError( stepName );
  }

  return resetEvent.eventId;
};

/**
 * Extract the workflow input from a Temporal history object.
 * The first event is always WorkflowExecutionStarted, which contains the input payloads.
 *
 * @param {object} history - Temporal History object from handle.fetchHistory()
 * @returns {any} The decoded first input argument, or null if unavailable
 */
export const extractWorkflowInput = history => {
  const payloads = history?.events?.[0]?.workflowExecutionStartedEventAttributes?.input?.payloads;
  if ( !payloads?.length ) {
    return null;
  }
  return defaultPayloadConverter.fromPayload( payloads[0] );
};

const PAYLOAD_FIELDS = {
  workflowExecutionStartedEventAttributes: [ 'input' ],
  workflowExecutionCompletedEventAttributes: [ 'result' ],
  activityTaskScheduledEventAttributes: [ 'input' ],
  activityTaskCompletedEventAttributes: [ 'result' ],
  activityTaskFailedEventAttributes: [ 'failure' ]
};

// Non-JSON payloads produce a { _raw: true, encoding } fallback instead of throwing.
export const decodeEventPayloads = event => {
  for ( const [ attrKey, fields ] of Object.entries( PAYLOAD_FIELDS ) ) {
    const attrs = event[attrKey];
    if ( !attrs ) {
      continue;
    }

    const decoded = { ...attrs };
    for ( const field of fields ) {
      if ( field === 'failure' ) {
        // failure is a Failure proto, not a Payloads wrapper -- extract message/stackTrace
        if ( attrs.failure ) {
          decoded.failure = {
            message: attrs.failure.message ?? null,
            stackTrace: attrs.failure.stackTrace ?? null,
            type: attrs.failure.failureInfo?.applicationFailureInfo?.type ?? null
          };
        }
        continue;
      }
      const payloads = attrs[field]?.payloads;
      if ( !payloads?.length ) {
        continue;
      }
      decoded[field] = payloads.map( p => {
        try {
          return defaultPayloadConverter.fromPayload( p );
        } catch ( error ) {
          const encoding = p?.metadata?.encoding ?
            Buffer.from( p.metadata.encoding ).toString() :
            'unknown';
          logger.warn( 'Failed to decode event payload', {
            eventId: event.eventId?.toString(),
            encoding,
            error: error.message
          } );
          return { _raw: true, encoding };
        }
      } );
    }
    return { ...event, [attrKey]: decoded };
  }
  return event;
};

export const serializeEvent = ( event, { includePayloads = false } = {} ) => {
  const eventType = typeof event.eventType === 'object' ?
    Number( event.eventType.toString() ) :
    event.eventType;

  if ( EventTypeName[eventType] === undefined && !warnedUnknownEventTypes.has( eventType ) ) {
    logger.warn( 'Unknown Temporal event type encountered', { eventType } );
    warnedUnknownEventTypes.add( eventType );
  }

  const serialized = {
    eventId: event.eventId?.toString() ?? null,
    eventType,
    eventTypeName: EventTypeName[eventType] ?? `UNKNOWN_${eventType}`,
    eventTime: serializeEventTime( event.eventTime )
  };

  const attrKey = Object.keys( event ).find( k => k.endsWith( 'EventAttributes' ) );
  if ( !attrKey || !event[attrKey] ) {
    return serialized;
  }

  // Forward-compat: for unknown event types, drop attrs when payloads aren't requested
  // to avoid leaking undefined payload-bearing fields on new Temporal enum values.
  if ( !includePayloads && EventTypeName[eventType] === undefined ) {
    return serialized;
  }

  const attrs = { ...event[attrKey] };

  if ( attrs.scheduledEventId ) {
    attrs.scheduledEventId = attrs.scheduledEventId.toString();
  }
  if ( attrs.startedEventId ) {
    attrs.startedEventId = attrs.startedEventId.toString();
  }

  // activityType.name uses the "workflow-name#stepName" convention; fall back to full name otherwise
  if ( attrs.activityType?.name ) {
    const name = attrs.activityType.name;
    attrs.stepName = name.includes( '#' ) ? name.split( '#' ).pop() : name;
  }

  if ( !includePayloads ) {
    delete attrs.input;
    delete attrs.result;
    delete attrs.failure;
    delete attrs.details;
    delete attrs.lastCompletionResult;
    delete attrs.lastFailure;
  }

  serialized[attrKey] = attrs;
  return serialized;
};

/**
 * Build a standardized workflow response object
 * @param {string} workflowId - The workflow execution id
 * @param {string} status - The workflow status
 * @param {Object} [options] - Optional fields
 * @param {any} [options.input] - The original workflow input
 * @param {any} [options.output] - The workflow output
 * @param {object} [options.trace] - Trace information
 * @param {string} [options.error] - Error message if failed
 * @returns {Object} Standardized workflow response
 */
const buildWorkflowResponse = ( workflowId, status, { input = null, output = null, trace = null, error = null } = {} ) =>
  ( { workflowId, status, input, output, trace, error } );

export default {
  async init() {
    logger.info( 'Temporal client connecting', { address, namespace } );

    // enable TLS only when connecting to remote (api key is present)
    const connection = await Connection.connect( { address, tls: Boolean( apiKey ), apiKey } );
    const client = new Client( { connection, namespace } );

    logger.info( 'Temporal client connected', { address, namespace } );

    /**
     * Resolve a workflow name (or alias) to the canonical workflow name via the catalog.
     *
     * @param {object} catalog - The catalog object
     * @param {string} workflowName - The workflow name or alias
     * @param {string} taskQueue - The task queue (for error messages)
     * @returns {string} The canonical workflow name
     * @throws {WorkflowNotFoundError}
     */
    const resolveWorkflowName = ( catalog, workflowName, taskQueue ) => {
      const resolved = catalog.workflows.find( w => w.name === workflowName || w.aliases?.includes( workflowName ) );
      if ( !resolved ) {
        throw new WorkflowNotFoundError( `Workflow "${workflowName}" is not available at worker "${taskQueue}"` );
      }
      if ( resolved.name !== workflowName ) {
        logger.info( 'Workflow alias resolved', { alias: workflowName, resolvedName: resolved.name, taskQueue } );
      }
      return resolved.name;
    };

    return {
      /**
       * Workflow execution result
       * @typedef {Object} WorkflowResult
       * @property {object} workflowId - The workflow execution id
       * @property {object} trace - Information about the traces of the execution
       */
      /**
       * Start the execution of a single workflow
       *
       * @param {string} workflowName - The type of the workflow
       * @param {any} input - The input arguments of the workflow
       * @param {Object} [options] - Optional configuration
       * @param {string} [options.workflowId] - Optional custom workflow ID. If not provided, one will be generated.
       * @param {string} [options.taskQueue] - The task queue to send the workflow execution to. Fallbacks to the default task queue.
       * @throws {WorkflowNotFoundError}
       * @throws {WorkflowExecutionTimedOutError}
       * @throws {CatalogNotAvailableError}
       * @returns {WorkflowResult}
       */
      async runWorkflow( workflowName, input, options = {} ) {
        const { workflowId: userWorkflowId, taskQueue = defaultTaskQueue, timeout } = options;

        // the catalog worker has the same name of the task queue
        const catalog = await getCatalog( { client, taskQueue } );
        const resolvedName = resolveWorkflowName( catalog, workflowName, taskQueue );

        const workflowId = userWorkflowId ?? buildWorkflowId();
        const executionTimeout = timeout ?? workflowExecutionMaxWaiting;
        const handle = await client.workflow.start( resolvedName, { args: [ input ], taskQueue, workflowId, workflowExecutionTimeout } );

        try {
          const result = await Promise.race( [
            handle.result(),
            new Promise( ( _, rj ) => setTimeout( () => rj( new WorkflowExecutionTimedOutError() ), executionTimeout ) )
          ] );
          return buildWorkflowResponse( workflowId, 'completed', {
            output: result.output ?? null,
            trace: result.trace ?? null
          } );
        } catch ( error ) {
          // Workflow failures are returned as data, not thrown
          if ( error instanceof WorkflowFailedError ) {
            logger.warn( 'Workflow execution failed', {
              workflowId,
              errorMessage: error.message,
              hasTrace: Boolean( extractTraceInfo( error ) )
            } );
            return buildWorkflowResponse( workflowId, 'failed', {
              trace: extractTraceInfo( error ) ?? null,
              error: extractErrorMessage( error )
            } );
          }
          // Other errors (timeout, not found, etc.) are still thrown
          error.workflowId = workflowId;
          throw error;
        }
      },

      /**
       * Workflow start result
       *
       * @typedef {Object} WorkflowStartResult
       * @property {string} workflowId - The id of the started workflow
       */
      /**
       * Start an workflow execution asynchronously
       *
       * @param {string} workflowName - The type of the workflow
       * @param {any} input - The input arguments of the workflow
       * @param {Object} [options] - Optional configuration
       * @param {string} [options.workflowId] - Optional custom workflow ID. If not provided, one will be generated.
       * @param {string} [options.taskQueue] - The task queue to send the workflow execution to. Fallbacks to the default task queue.
       * @returns {WorkflowStartResult}
       */
      async startWorkflow( workflowName, input, options = {} ) {
        const { workflowId: userWorkflowId, taskQueue = defaultTaskQueue } = options;
        const catalog = await getCatalog( { client, taskQueue } );
        const resolvedName = resolveWorkflowName( catalog, workflowName, taskQueue );
        const workflowId = userWorkflowId ?? buildWorkflowId();
        await client.workflow.start( resolvedName, { args: [ input ], taskQueue, workflowId, workflowExecutionTimeout } );
        return { workflowId };
      },

      /**
       * @typedef {Object} WorkflowExecutionStatus
       * @property {string} workflowId - The workflow execution id
       * @property {('canceled'|'completed'|'continued_as_new'|'failed'|'running'|'terminated'|'timed_out'|'unspecified')} status - The workflow execution status
       * @property {number} startedAt - The start date of the workflow execution
       * @property {number} completedAt - The end date of the workflow execution
       */
      /**
       * Get the status of a workflow execution
       *
       * @param {string} workflowId
       * @returns {WorkflowExecutionStatus}
       * @throws WorkflowNotFoundError
       */
      async getWorkflowStatus( workflowId ) {
        const handle = client.workflow.getHandle( workflowId );
        const description = await handle.describe();

        return {
          workflowId,
          status: description.status.name.toLocaleLowerCase(),
          startedAt: description.startTime ? new Date( description.startTime ).getTime() : '',
          completedAt: description.closeTime ? new Date( description.closeTime ).getTime() : ''
        };
      },

      /**
       * Cancel a workflow execution
       *
       * @param {string} workflowId  - The workflow execution id
       * @throws {WorkflowNotFoundError}
       */
      async stopWorkflow( workflowId ) {
        const handle = client.workflow.getHandle( workflowId );
        await handle.cancel();
      },

      /**
       * Terminate a workflow execution (force stop)
       *
       * @param {string} workflowId  - The workflow execution id
       * @param {string} [reason]    - Optional reason for termination
       * @throws {WorkflowNotFoundError}
       */
      async terminateWorkflow( workflowId, reason ) {
        const handle = client.workflow.getHandle( workflowId );
        await handle.terminate( reason );
      },

      /**
       * Workflow result with trace information
       * @typedef {Object} WorkflowResultWithTrace
       * @property {string} workflowId - The workflow execution id
       * @property {object|null} output - The workflow output, null if workflow failed
       * @property {object|null} trace - Trace information including destinations
       * @property {string} status - The workflow status (completed, failed, canceled, etc.)
       * @property {string|null} error - Error message if workflow failed, null otherwise
       */
      /**
       * Get the result of a workflow execution
       *
       * @param {string} workflowId - The workflow execution id
       * @returns {WorkflowResultWithTrace}
       * @throws {WorkflowNotFoundError}
       * @throws {WorkflowNotCompletedError} - Only thrown if workflow is still running
       */
      async getWorkflowResult( workflowId ) {
        const handle = client.workflow.getHandle( workflowId );
        const [ description, history ] = await Promise.all( [
          handle.describe(),
          handle.fetchHistory()
        ] );

        // Only throw if workflow is still running (not in a terminal state)
        if ( !TERMINAL_STATUS_CODES.has( description.status.code ) ) {
          throw new WorkflowNotCompletedError();
        }

        const status = mapWorkflowStatus( description.status.name );
        const input = extractWorkflowInput( history );

        // For completed workflows, return the full result
        if ( description.status.code === TemporalStatus.COMPLETED ) {
          const result = await handle.result();
          return buildWorkflowResponse( workflowId, status, {
            input,
            output: result.output ?? null,
            trace: result.trace ?? null
          } );
        }

        // CONTINUED_AS_NEW is not an error - it means the workflow continued in a new execution
        if ( description.status.code === TemporalStatus.CONTINUED_AS_NEW ) {
          return buildWorkflowResponse( workflowId, status, { input } );
        }

        // For other terminal statuses (failed, canceled, terminated, timed_out), extract trace from error details
        // The workflow interceptor puts trace metadata in ApplicationFailure.details when workflows fail
        const workflowError = await handle.result()
          .then( () => null )
          .catch( e => {
            if ( e instanceof WorkflowFailedError ) {
              return e;
            }
            // Unexpected error (connection, auth, etc.) - don't mask as workflow failure
            logger.error( 'Unexpected error fetching workflow result', {
              workflowId,
              status,
              errorType: e.constructor.name,
              message: e.message
            } );
            throw e;
          } );

        return buildWorkflowResponse( workflowId, status, {
          input,
          trace: workflowError ? extractTraceInfo( workflowError ) ?? null : null,
          error: workflowError ? extractErrorMessage( workflowError ) : null
        } );
      },

      /**
       * Execute a query on a given workflow (The query has to be registered beforehand).
       *
       * @param {string} workflowId - The id of the workflow to send the query to
       * @param {string} queryName - The name of the query to execute
       * @returns {object} The result of the query
       * @throws WorkflowNotFoundError
       */
      async queryWorkflow( workflowId, queryName ) {
        const handle = client.workflow.getHandle( workflowId );
        return handle.query( queryName );
      },

      /**
       * Send an arbitrary signal to a workflow
       *
       * @param {string} workflowId - The id of the workflow
       * @param {string} signalName - The name of the signal to send (as set using defineSignal)
       * @param {any} payload - The payload to send to the signal
       * @returns {void}
       * @throws WorkflowNotFoundError
       */
      async sendSignal( workflowId, signalName, payload ) {
        const handle = client.workflow.getHandle( workflowId );
        await handle.signal( signalName, payload );
      },

      /**
       * Send an arbitrary query to a workflow
       *
       * @param {string} workflowId - The id of the workflow
       * @param {string} queryName - The name of the query to send (as set using defineQuery)
       * @param {any} payload - The payload to send to the query
       * @returns {unknown} The result of the query, as sent by the workflow
       * @throws WorkflowNotFoundError
       */
      async sendQuery( workflowId, queryName, payload ) {
        const handle = client.workflow.getHandle( workflowId );
        return handle.query( queryName, payload );
      },

      /**
       * Execute an arbitrary update to a workflow
       *
       * @param {string} workflowId - The id of the workflow
       * @param {string} updateName - The name of the query (as set using defineUpdate)
       * @param {any} payload - The payload to send to the query
       * @returns {unknown} The result of the update, if the worker return something
       * @throws WorkflowNotFoundError
       */
      async executeUpdate( workflowId, updateName, payload ) {
        const handle = client.workflow.getHandle( workflowId );
        return handle.executeUpdate( updateName, {
          args: [ payload ]
        } );
      },

      /**
       * Reset a workflow to re-run from after a specific completed step.
       * Terminates the current run and creates a new one that replays up to the
       * specified step, then re-executes all subsequent steps.
       *
       * @param {string} workflowId - The workflow execution id
       * @param {string} stepName - The step name to reset after (e.g., "consolidateCompetitors")
       * @param {string} [reason] - Optional reason for the reset
       * @returns {{ workflowId: string, runId: string }}
       * @throws {WorkflowNotFoundError}
       * @throws {StepNotFoundError}
       * @throws {StepNotCompletedError}
       */
      async resetWorkflow( workflowId, stepName, reason ) {
        const handle = client.workflow.getHandle( workflowId );
        const history = await handle.fetchHistory();
        const resetEventId = resolveResetEventId( history.events, stepName );

        const response = await connection.workflowService.resetWorkflowExecution( {
          namespace,
          workflowExecution: { workflowId },
          reason: reason || `Reset to re-run from after step "${stepName}"`,
          workflowTaskFinishEventId: resetEventId,
          requestId: buildWorkflowId()
        } );

        return { workflowId, runId: response.runId };
      },

      async getWorkflowHistory( workflowId, { runId, pageSize = 20, pageToken, includePayloads = false } = {} ) {
        const firstPage = !pageToken;
        const metadata = firstPage ? await ( async () => {
          const handle = client.workflow.getHandle( workflowId, runId );
          const description = await handle.describe();
          return {
            workflow: {
              workflowId,
              runId: description.runId,
              status: mapWorkflowStatus( description.status.name ),
              startTime: description.startTime?.toISOString() ?? null,
              closeTime: description.closeTime?.toISOString() ?? null,
              historyLength: description.historyLength,
              taskQueue: description.taskQueue
            },
            resolvedRunId: description.runId
          };
        } )() : { workflow: null, resolvedRunId: runId };

        const response = await connection.workflowService.getWorkflowExecutionHistory( {
          namespace,
          execution: { workflowId, runId: metadata.resolvedRunId },
          maximumPageSize: Math.min( pageSize, 50 ),
          nextPageToken: pageToken ? Buffer.from( pageToken, 'base64' ) : undefined
        } ).catch( error => {
          if ( !error ) {
            throw new Error( 'Temporal getWorkflowExecutionHistory rejected with no error' );
          }
          if ( error.code === GRPC_STATUS.NOT_FOUND ) {
            throw new WorkflowNotFoundError( `Workflow "${workflowId}" not found` );
          }
          if ( error.code === GRPC_STATUS.INVALID_ARGUMENT ) {
            throw new InvalidPageTokenError();
          }
          throw error;
        } );

        if ( !response.history ) {
          logger.warn( 'Temporal getWorkflowExecutionHistory returned no history field', { workflowId, runId: metadata.resolvedRunId } );
        }

        const events = ( response.history?.events || [] ).map( event => {
          const decoded = includePayloads ? decodeEventPayloads( event ) : event;
          return serializeEvent( decoded, { includePayloads } );
        } );

        const nextPageToken = response.history && response.nextPageToken?.length ?
          Buffer.from( response.nextPageToken ).toString( 'base64' ) :
          null;

        return {
          workflow: metadata.workflow,
          events,
          runId: metadata.resolvedRunId,
          nextPageToken
        };
      },

      /**
       * Shutdown this client
       * @returns {void}
       */
      async close() {
        await connection.close();
      },

      /**
       * Workflow run info
       * @typedef {Object} WorkflowRunInfo
       * @property {string} workflowId - The workflow execution id
       * @property {string} workflowType - The workflow type/name
       * @property {string} status - The workflow execution status
       * @property {string} startedAt - The start date of the workflow execution (ISO 8601)
       * @property {string|null} completedAt - The end date of the workflow execution (ISO 8601) or null if not completed
       */
      /**
       * Workflow runs list result
       * @typedef {Object} WorkflowRunsListResult
       * @property {WorkflowRunInfo[]} runs - List of workflow runs
       * @property {number} count - Number of runs returned
       */
      /**
       * List workflow runs with optional filtering
       *
       * @param {Object} [options] - Optional configuration
       * @param {string} [options.workflowType] - Filter by workflow type/name
       * @param {number} [options.limit=100] - Maximum number of runs to return
       * @returns {WorkflowRunsListResult}
       */
      async listWorkflowRuns( options = {} ) {
        const { workflowType, limit = 100 } = options;

        const query = workflowType ?
          `WorkflowType = "${workflowType}"` :
          undefined;

        const executions = await takeFromAsyncIterable(
          client.workflow.list( { query } ),
          limit
        );

        const runs = executions.map( execution => ( {
          workflowId: execution.workflowId,
          workflowType: execution.type,
          status: mapWorkflowStatus( execution.status.name ),
          startedAt: execution.startTime.toISOString(),
          completedAt: execution.closeTime?.toISOString() ?? null
        } ) );

        return { runs, count: runs.length };
      }
    };
  }
};
