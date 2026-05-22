import { Context } from '@temporalio/activity';
import { Storage } from '#async_storage';
import * as Tracing from '#tracing';
import { headersToObject } from '../sandboxed_utils.js';
import { BusEventType, METADATA_ACCESS_SYMBOL, Signal } from '#consts';
import { activityHeartbeatEnabled, activityHeartbeatIntervalMs, namespace } from '../configs.js';
import { messageBus } from '#bus';
import { Client } from '@temporalio/client';
import { createChildLogger } from '#logger';
import { allSettledWithTimeout } from '#utils';

const log = createChildLogger( 'ActivityInterceptor' );

const IN_FLIGHT_SIGNALS_TIMEOUT_MS = 30_000;

const flushSignals = async signals => {
  try {
    await allSettledWithTimeout( signals, IN_FLIGHT_SIGNALS_TIMEOUT_MS );
  } catch ( error ) {
    if ( error.isTimeout ) {
      log.warn( 'Some usage/cost attributes were missed because not all activity signals were sent to the workflow' );
    } else {
      throw error;
    }
  }
};

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
    const client = new Client( { connection: this.connection, namespace } );

    const { workflowExecution: { workflowId }, activityId: id, activityType: name, workflowType: workflowName } = Context.current().info;
    const { executionContext } = headersToObject( input.headers );
    const { type: kind } = this.activities?.[name]?.[METADATA_ACCESS_SYMBOL];
    const { path: workflowFilename } = this.getWorkflowEntry( workflowName );

    const workflowHandle = client.workflow.getHandle( workflowId );

    const state = {
      heartbeat: null,
      activityOutput: undefined,
      signals: []
    };

    const sendAttributeSignal = attribute => {
      attribute.setActivity( id, name );
      state.signals.push(
        workflowHandle
          .signal( Signal.ADD_ATTRIBUTE, attribute )
          .catch( e => log.warn( `Signal "${Signal.ADD_ATTRIBUTE}" failed`, { message: e.message, stack: e.stack } ) )
      );
    };

    // Wraps the execution with accessible metadata for the activity
    const ctx = { parentId: id, executionContext, workflowFilename, sendAttributeSignal };

    messageBus.emit( BusEventType.ACTIVITY_START, { id, name, kind, workflowId, workflowName } );
    Tracing.addEventStart( { id, name, kind, parentId: workflowId, details: input.args[0], executionContext } );

    try {
      // Sends heartbeat to communicate that activity is still alive
      state.heartbeat = activityHeartbeatEnabled && setInterval( () => Context.current().heartbeat(), activityHeartbeatIntervalMs );

      try {
        state.activityOutput = await Storage.runWithContext( async _ => next( input ), ctx );
      } finally {
        // Ensure in-flight signals are delivered (up to a reasonable time) before handling errors
        await flushSignals( state.signals );
      }

      messageBus.emit( BusEventType.ACTIVITY_END, { id, name, kind, workflowId, workflowName, duration: Date.now() - startDate } );
      Tracing.addEventEnd( { id, details: state.activityOutput, executionContext } );
      return state.activityOutput;

    } catch ( error ) {
      messageBus.emit( BusEventType.ACTIVITY_ERROR, { id, name, kind, workflowId, workflowName, duration: Date.now() - startDate, error } );
      Tracing.addEventError( { id, details: error, executionContext } );

      throw error;
    } finally {
      clearInterval( state.heartbeat );
    }
  }
};
