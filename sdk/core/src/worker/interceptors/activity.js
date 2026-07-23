import { Context, activityInfo as activityInfoFn, ApplicationFailure } from '@temporalio/activity';
import { CompleteAsyncError, TemporalFailure } from '@temporalio/common';
import { Storage } from '#async_storage';
import * as Tracing from '#tracing';
import { headersToObject } from './headers.js';
import { ActivitySpecialOutput, BusEventType, METADATA_ACCESS_SYMBOL } from '#consts';
import { activityHeartbeatEnabled, activityHeartbeatIntervalMs } from '../configs.js';
import { mainEventBus } from '#bus';
import { inheritsFromAnyNamedType, serializeError } from '#helpers/errors';

/*
  This interceptor wraps every activity execution with cross-cutting concerns:

  1. Tracing: records start/end/error events and sets up AsyncLocalStorage context
     so nested operations (e.g. HTTP calls inside steps) can be traced back to the parent activity.

  2. Heartbeating: sends periodic heartbeat signals to Temporal so it can detect dead workers
     without waiting for the full startToCloseTimeout (which can be up to 1h+).
     This is critical during deploys — when a worker restarts, Temporal will notice
     the missing heartbeat within the heartbeatTimeout window and retry the activity
     on a new worker, instead of waiting the entire startToCloseTimeout.

  Context information comes from two sources:
  - Temporal's Activity Context (workflowId, activityId, activityType)
  - Headers injected by the workflow interceptor
*/
export class ActivityExecutionInterceptor {
  constructor( { activities, workflows } ) {
    // convert activities{} object to a map: activityType:kind
    this.activityKindMap = new Map( Object.entries( activities )
      .map( ( [ type, fn ] ) => ( [ type, fn[METADATA_ACCESS_SYMBOL].type ] ) ) );

    // convert workflows[] array to a map: workflowType/alias.n:path
    this.workflowsPathMap = new Map( workflows.flatMap( ( { name, aliases, path } ) =>
      [ name, ...aliases ?? [] ].map( a => ( [ a, path ] ) )
    ) );
  };

  async execute( input, next ) {
    const activityInfo = activityInfoFn();
    const { workflowExecution: { runId }, activityId, activityType, workflowType } = activityInfo;
    const { traceInfo, workflowDetails } = headersToObject( input.headers );
    const outputActivityKind = this.activityKindMap.get( activityType );
    const workflowFilename = this.workflowsPathMap.get( workflowType );

    if ( !outputActivityKind ) {
      throw new Error( `Activity interceptor: activity "${activityType}" was not registered.` );
    }
    if ( !workflowFilename ) {
      throw new Error( `Activity interceptor: workflow "${workflowType}" was not registered.` );
    }

    const state = {
      heartbeat: null,
      attributes: []
    };

    // Adds context accessible information
    const storageContext = {
      parentId: activityId,
      outputActivityKind,
      activityInfo,
      workflowDetails,
      workflowFilename,
      traceInfo
    };

    mainEventBus.emit( BusEventType.ACTIVITY_START, { activityInfo, workflowDetails, outputActivityKind } );
    Tracing.addEventStart( { id: activityId, name: activityType, kind: outputActivityKind, parentId: runId, details: input.args[0], traceInfo } );

    try {
      // Sends heartbeat to communicate that activity is still alive
      state.heartbeat = activityHeartbeatEnabled && setInterval( () => Context.current().heartbeat(), activityHeartbeatIntervalMs );

      const output = await Storage.runWithContext( async _ => next( input ), storageContext );

      mainEventBus.emit( BusEventType.ACTIVITY_END, { activityInfo, workflowDetails, outputActivityKind } );
      Tracing.addEventEnd( { id: activityId, details: output, traceInfo } );

      return output;

    } catch ( error ) {
      // Record async completion handoff as a trace end without emitting a bus event.
      if ( error instanceof CompleteAsyncError ) {
        Tracing.addEventEnd( { id: activityId, details: ActivitySpecialOutput.ASYNC_HANDOFF, traceInfo } );
        throw error;
      }

      Tracing.addEventError( { id: activityId, details: error, traceInfo } );
      mainEventBus.emit( BusEventType.ACTIVITY_ERROR, { activityInfo, workflowDetails, outputActivityKind, error } );

      // Native Temporal errors are just re-thrown
      if ( error instanceof TemporalFailure ) {
        throw error;
      }

      throw ApplicationFailure.fromError( error, {
        nonRetryable: inheritsFromAnyNamedType( error, activityInfo.retryPolicy?.nonRetryableErrorTypes ?? [] ),
        cause: error,
        details: [ { error: serializeError( error, { includeStack: false } ) } ]
      } );
    } finally {
      clearInterval( state.heartbeat );
    }
  }
};
