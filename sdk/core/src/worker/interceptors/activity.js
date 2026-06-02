import { Context, activityInfo as activityInfoFn } from '@temporalio/activity';
import { Storage } from '#async_storage';
import * as Tracing from '#tracing';
import { headersToObject } from '../sandboxed_utils.js';
import { ACTIVITY_WRAPPER_VERSION_FIELD, BusEventType, METADATA_ACCESS_SYMBOL, Signal } from '#consts';
import { activityHeartbeatEnabled, activityHeartbeatIntervalMs, namespace } from '../configs.js';
import { messageBus } from '#bus';
import { Client } from '@temporalio/client';
import { createChildLogger } from '#logger';
import { aggregateAttributes } from '#internal_utils/aggregations';

const log = createChildLogger( 'ActivityInterceptor' );

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
  constructor( { activities, workflows, connection } ) {
    this.activities = activities;
    this.workflowsMap = workflows.reduce( ( map, w ) => {
      map.set( w.name, w );
      for ( const alias of w.aliases ?? [] ) {
        map.set( alias, w );
      }
      return map;
    }, new Map() );
    this.connection = connection;
  };

  /**
   * Returns a workflow entry by its name or throws error
   * @param {string} workflowType
   * @returns {object} Workflow entry
   * @throws {Error}
   */
  getWorkflowEntry( workflowType ) {
    const workflowEntry = this.workflowsMap.get( workflowType );
    if ( !workflowEntry ) {
      throw new Error( `Activity interceptor: workflow "${workflowType}" not found in workflowsMap.` );
    }
    return workflowEntry;
  }

  async execute( input, next ) {
    const activityInfo = activityInfoFn();
    const { workflowExecution: { workflowId, runId }, activityId, activityType, workflowType } = activityInfo;
    const { traceInfo, workflowDetails } = headersToObject( input.headers );
    const { type: outputActivityKind } = this.activities?.[activityType]?.[METADATA_ACCESS_SYMBOL];
    const { path: workflowFilename } = this.getWorkflowEntry( workflowType );

    const state = {
      heartbeat: null,
      attributes: []
    };

    const addAttribute = attribute => state.attributes.push( attribute );

    const sendAggregationsViaSignal = async () => {
      if ( state.attributes.length > 0 ) {
        try {
          const client = new Client( { connection: this.connection, namespace } );
          const workflowHandle = client.workflow.getHandle( workflowId );
          await workflowHandle.signal( Signal.SEND_AGGREGATIONS, aggregateAttributes( state.attributes ) );
        } catch ( error ) {
          const errorContext = { message: error.message, stack: error.stack, activityId, activityType, workflowId, workflowType, runId };
          log.warn( `Signal "${Signal.SEND_AGGREGATIONS}" failed`, errorContext );
        }
      }
    };

    // Adds context accessible information
    const storageContext = {
      parentId: activityId,
      outputActivityKind,
      activityInfo,
      workflowDetails,
      workflowFilename,
      traceInfo,
      addAttribute
    };

    messageBus.emit( BusEventType.ACTIVITY_START, { activityInfo, workflowDetails, outputActivityKind } );
    Tracing.addEventStart( { id: activityId, name: activityType, kind: outputActivityKind, parentId: runId, details: input.args[0], traceInfo } );

    try {
      // Sends heartbeat to communicate that activity is still alive
      state.heartbeat = activityHeartbeatEnabled && setInterval( () => Context.current().heartbeat(), activityHeartbeatIntervalMs );

      const output = await Storage.runWithContext( async _ => next( input ), storageContext );

      messageBus.emit( BusEventType.ACTIVITY_END, { activityInfo, workflowDetails, outputActivityKind } );
      Tracing.addEventEnd( { id: activityId, details: output, traceInfo } );

      return {
        [ACTIVITY_WRAPPER_VERSION_FIELD]: 1,
        output,
        aggregations: state.attributes.length > 0 ? aggregateAttributes( state.attributes ) : null
      };

    } catch ( error ) {
      messageBus.emit( BusEventType.ACTIVITY_ERROR, { activityInfo, workflowDetails, outputActivityKind, error } );
      Tracing.addEventError( { id: activityId, details: error, traceInfo } );

      await sendAggregationsViaSignal();

      throw error;
    } finally {
      clearInterval( state.heartbeat );
    }
  }
};
