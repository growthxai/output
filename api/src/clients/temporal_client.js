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
  StepNotCompletedError
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

/**
 * Temporal history event types used for workflow reset resolution.
 * Values correspond to temporal.api.enums.v1.EventType protobuf enum.
 */
const EventType = {
  WORKFLOW_TASK_COMPLETED: 7,
  ACTIVITY_TASK_SCHEDULED: 10,
  ACTIVITY_TASK_COMPLETED: 12
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

/**
 * Build a standardized workflow response object
 * @param {string} workflowId - The workflow execution id
 * @param {string} status - The workflow status
 * @param {Object} [options] - Optional fields
 * @param {string|null} [options.runId] - The specific run id for this execution
 * @param {any} [options.input] - The original workflow input
 * @param {any} [options.output] - The workflow output
 * @param {object} [options.trace] - Trace information
 * @param {string} [options.error] - Error message if failed
 * @returns {Object} Standardized workflow response
 */
const buildWorkflowResponse = ( workflowId, status, { runId = null, input = null, output = null, trace = null, error = null } = {} ) =>
  ( { workflowId, runId, status, input, output, trace, error } );

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
       * Workflow execution result returned by getWorkflowResult and runWorkflow.
       * Matches the shape produced by buildWorkflowResponse.
       *
       * @typedef {Object} WorkflowResult
       * @property {string} workflowId - The workflow execution id
       * @property {string|null} runId - The specific run id for this execution, null if unavailable
       * @property {('completed'|'failed'|'canceled'|'terminated'|'timed_out'|'continued'|'unspecified')} status - Execution status
       * @property {any} input - The original workflow input, null if unavailable
       * @property {any} output - The workflow output, null if failed or unavailable
       * @property {object|null} trace - Trace information including destinations, null if none
       * @property {string|null} error - Error message if workflow failed, null otherwise
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
        const runId = handle.firstExecutionRunId ?? null;

        try {
          const result = await Promise.race( [
            handle.result(),
            new Promise( ( _, rj ) => setTimeout( () => rj( new WorkflowExecutionTimedOutError() ), executionTimeout ) )
          ] );
          return buildWorkflowResponse( workflowId, 'completed', {
            runId,
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
              runId,
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
       * @property {string|null} runId - The first execution's run id, null if unavailable
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
        const handle = await client.workflow.start( resolvedName, { args: [ input ], taskQueue, workflowId, workflowExecutionTimeout } );
        return { workflowId, runId: handle.firstExecutionRunId ?? null };
      },

      /**
       * @typedef {Object} WorkflowExecutionStatus
       * @property {string} workflowId - The workflow execution id
       * @property {string|null} runId - The specific run id for this execution
       * @property {('canceled'|'completed'|'continued_as_new'|'failed'|'running'|'terminated'|'timed_out'|'unspecified')} status - The workflow execution status
       * @property {number} startedAt - The start date of the workflow execution
       * @property {number} completedAt - The end date of the workflow execution
       */
      /**
       * Get the status of a workflow execution
       *
       * @param {string} workflowId
       * @param {string} [runId] - Optional specific run id; defaults to the latest run
       * @returns {WorkflowExecutionStatus}
       * @throws WorkflowNotFoundError
       */
      async getWorkflowStatus( workflowId, runId ) {
        const handle = client.workflow.getHandle( workflowId, runId );
        const description = await handle.describe();

        return {
          workflowId,
          runId: description.runId,
          status: description.status.name.toLocaleLowerCase(),
          startedAt: description.startTime ? new Date( description.startTime ).getTime() : '',
          completedAt: description.closeTime ? new Date( description.closeTime ).getTime() : ''
        };
      },

      /**
       * Stop a workflow execution (graceful cancellation; workflow may run cleanup).
       *
       * @param {string} workflowId  - The workflow execution id
       * @param {string} [runId] - Optional specific run id; defaults to the latest run
       * @returns {{ workflowId: string, runId: string }} The stopped workflow id and the run id that was actually targeted.
       * @throws {WorkflowNotFoundError}
       */
      async stopWorkflow( workflowId, runId ) {
        const handle = client.workflow.getHandle( workflowId, runId );
        await handle.cancel();
        if ( runId ) {
          return { workflowId, runId };
        }
        const description = await handle.describe();
        return { workflowId, runId: description.runId };
      },

      /**
       * Terminate a workflow execution (force stop; no cleanup).
       *
       * @param {string} workflowId  - The workflow execution id
       * @param {string} [reason]    - Optional reason for termination
       * @param {string} [runId]     - Optional specific run id; defaults to the latest run
       * @returns {{ workflowId: string, runId: string }} The terminated workflow id and the run id that was actually targeted.
       * @throws {WorkflowNotFoundError}
       */
      async terminateWorkflow( workflowId, reason, runId ) {
        const handle = client.workflow.getHandle( workflowId, runId );
        await handle.terminate( reason );
        if ( runId ) {
          return { workflowId, runId };
        }
        const description = await handle.describe();
        return { workflowId, runId: description.runId };
      },

      /**
       * Get the result of a workflow execution.
       *
       * @param {string} workflowId - The workflow execution id
       * @param {string} [runId] - Optional specific run id; defaults to the latest run
       * @returns {WorkflowResult}
       * @throws {WorkflowNotFoundError}
       * @throws {WorkflowNotCompletedError} - Only thrown if workflow is still running
       */
      async getWorkflowResult( workflowId, runId ) {
        const handle = client.workflow.getHandle( workflowId, runId );
        const description = await handle.describe();

        // Only throw if workflow is still running (not in a terminal state)
        if ( !TERMINAL_STATUS_CODES.has( description.status.code ) ) {
          throw new WorkflowNotCompletedError();
        }

        const resolvedRunId = description.runId;
        if ( !resolvedRunId ) {
          // Temporal should always report a runId for a terminal execution; if not, fail loudly
          // rather than silently reuse the unpinned handle (which risks racing continueAsNew).
          throw new Error( `Temporal did not report a runId for workflow "${workflowId}"` );
        }
        // Pin a handle to the resolved run so subsequent RPCs can't race against continueAsNew
        const pinnedHandle = runId ? handle : client.workflow.getHandle( workflowId, resolvedRunId );
        const history = await pinnedHandle.fetchHistory();

        const status = mapWorkflowStatus( description.status.name );
        const input = extractWorkflowInput( history );

        // For completed workflows, return the full result
        if ( description.status.code === TemporalStatus.COMPLETED ) {
          const result = await pinnedHandle.result();
          return buildWorkflowResponse( workflowId, status, {
            runId: resolvedRunId,
            input,
            output: result.output ?? null,
            trace: result.trace ?? null
          } );
        }

        // CONTINUED_AS_NEW is not an error - it means the workflow continued in a new execution
        if ( description.status.code === TemporalStatus.CONTINUED_AS_NEW ) {
          return buildWorkflowResponse( workflowId, status, { runId: resolvedRunId, input } );
        }

        // For other terminal statuses (failed, canceled, terminated, timed_out), extract trace from error details
        // The workflow interceptor puts trace metadata in ApplicationFailure.details when workflows fail
        const workflowError = await pinnedHandle.result()
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
          runId: resolvedRunId,
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
       * @param {string} [runId] - Optional specific run id to reset; defaults to the latest run
       * @returns {{ workflowId: string, runId: string }} The original workflowId and the runId of the **new** execution created by the reset (not the input pin).
       * @throws {WorkflowNotFoundError}
       * @throws {StepNotFoundError}
       * @throws {StepNotCompletedError}
       */
      async resetWorkflow( workflowId, stepName, reason, runId ) {
        const handle = client.workflow.getHandle( workflowId, runId );

        // Pin the runId before reading history so fetchHistory and the reset RPC
        // target the same execution. Describing first (not after fetchHistory)
        // closes the continueAsNew race where the "latest" run can change between
        // the history read and the reset.
        const resolvedRunId = runId ?? ( await handle.describe() ).runId;
        if ( !resolvedRunId ) {
          throw new Error( `Temporal did not report a runId for workflow "${workflowId}"` );
        }
        const pinnedHandle = runId ? handle : client.workflow.getHandle( workflowId, resolvedRunId );

        const history = await pinnedHandle.fetchHistory();
        const resetEventId = resolveResetEventId( history.events, stepName );

        const response = await connection.workflowService.resetWorkflowExecution( {
          namespace,
          workflowExecution: { workflowId, runId: resolvedRunId },
          reason: reason || `Reset to re-run from after step "${stepName}"`,
          workflowTaskFinishEventId: resetEventId,
          requestId: buildWorkflowId()
        } );

        return { workflowId, runId: response.runId };
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
