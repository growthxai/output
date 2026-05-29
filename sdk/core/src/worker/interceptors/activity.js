import { Context } from '@temporalio/activity';
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
  - Headers injected by the workflow interceptor (executionContext)
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
   * @param {string} workflowName
   * @returns {object} Workflow entry
   * @throws {Error}
   */
  getWorkflowEntry( workflowName ) {
    const workflowEntry = this.workflowsMap.get( workflowName );
    if ( !workflowEntry ) {
      throw new Error( `Activity interceptor: workflow "${workflowName}" not found in workflowsMap.` );
    }
    return workflowEntry;
  }

  async execute( input, next ) {
    const startDate = Date.now();

    const { workflowExecution: { workflowId }, activityId: id, activityType: name, workflowType: workflowName } = Context.current().info;
    const { executionContext } = headersToObject( input.headers );
    const { type: kind } = this.activities?.[name]?.[METADATA_ACCESS_SYMBOL];
    const { path: workflowFilename } = this.getWorkflowEntry( workflowName );

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
          log.warn( `Signal "${Signal.SEND_AGGREGATIONS}" failed`, {
            message: error.message,
            stack: error.stack,
            activityId: id,
            activityName: name,
            workflowId,
            workflowName
          } );
        }
      }
    };

    // Wraps the execution with accessible metadata for the activity
    const ctx = { parentId: id, executionContext, workflowFilename, addAttribute };

    messageBus.emit( BusEventType.ACTIVITY_START, { id, name, kind, workflowId, workflowName } );
    Tracing.addEventStart( { id, name, kind, parentId: workflowId, details: input.args[0], executionContext } );

    try {
      // Sends heartbeat to communicate that activity is still alive
      state.heartbeat = activityHeartbeatEnabled && setInterval( () => Context.current().heartbeat(), activityHeartbeatIntervalMs );

      const output = await Storage.runWithContext( async _ => next( input ), ctx );

      messageBus.emit( BusEventType.ACTIVITY_END, { id, name, kind, workflowId, workflowName, duration: Date.now() - startDate } );
      Tracing.addEventEnd( { id, details: output, executionContext } );
      return {
        [ACTIVITY_WRAPPER_VERSION_FIELD]: 1,
        output,
        aggregations: state.attributes.length > 0 ? aggregateAttributes( state.attributes ) : null
      };

    } catch ( error ) {
      messageBus.emit( BusEventType.ACTIVITY_ERROR, { id, name, kind, workflowId, workflowName, duration: Date.now() - startDate, error } );
      Tracing.addEventError( { id, details: error, executionContext } );

      await sendAggregationsViaSignal();

      throw error;
    } finally {
      clearInterval( state.heartbeat );
    }
  }
};
