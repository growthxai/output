import { Context } from '@temporalio/activity';
import { Storage } from '#async_storage';
import * as Tracing from '#tracing';
import { headersToObject } from '../sandboxed_utils.js';
import { BusEventType, METADATA_ACCESS_SYMBOL } from '#consts';
import { activityHeartbeatEnabled, activityHeartbeatIntervalMs } from '../configs.js';
import { messageBus } from '#bus';

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
  constructor( { activities, workflows } ) {
    this.activities = activities;
    this.workflowsMap = workflows.reduce( ( map, w ) => {
      map.set( w.name, w );
      for ( const alias of w.aliases ?? [] ) {
        map.set( alias, w );
      }
      return map;
    }, new Map() );
  };

  async execute( input, next ) {
    const startDate = Date.now();
    const { workflowExecution: { workflowId }, activityId: id, activityType: name, workflowType: workflowName } = Context.current().info;
    const { executionContext } = headersToObject( input.headers );
    const { type: kind } = this.activities?.[name]?.[METADATA_ACCESS_SYMBOL];
    const workflowFilename = this.workflowsMap.get( workflowName ).path;

    messageBus.emit( BusEventType.ACTIVITY_START, { id, name, kind, workflowId, workflowName } );
    Tracing.addEventStart( { id, name, kind, parentId: workflowId, details: input.args[0], executionContext } );

    const intervals = { heartbeat: null };
    try {
      // Sends heartbeat to communicate that activity is still alive
      intervals.heartbeat = activityHeartbeatEnabled && setInterval( () => Context.current().heartbeat(), activityHeartbeatIntervalMs );

      // Wraps the execution with accessible metadata for the activity
      const output = await Storage.runWithContext( async _ => next( input ), { parentId: id, executionContext, workflowFilename } );

      messageBus.emit( BusEventType.ACTIVITY_END, { id, name, kind, workflowId, workflowName, duration: Date.now() - startDate } );
      Tracing.addEventEnd( { id, details: output, executionContext } );
      return output;

    } catch ( error ) {
      messageBus.emit( BusEventType.ACTIVITY_ERROR, { id, name, kind, workflowId, workflowName, duration: Date.now() - startDate, error } );
      Tracing.addEventError( { id, details: error, executionContext } );

      throw error;
    } finally {
      clearInterval( intervals.heartbeat );
    }
  }
};
