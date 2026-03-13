import { BusEventType, ComponentType } from '#consts';
import * as Tracing from '#tracing';
import { messageBus } from '#bus';

// This sink allow for sandbox Temporal environment to send trace logs back to the main thread.
export const sinks = {

  /**
   * Workflow lifecycle sinks
   */
  workflow: {
    start: {
      fn: ( workflowInfo, input ) => {
        const { workflowId: id, workflowType: name, memo: { parentId, executionContext } } = workflowInfo;
        messageBus.emit( BusEventType.WORKFLOW_START, { id, name } );
        if ( executionContext ) { // filters out internal workflows
          Tracing.addEventStart( { id, kind: ComponentType.WORKFLOW, name, details: input, parentId, executionContext } );
        }
      },
      callDuringReplay: false
    },

    end: {
      fn: ( workflowInfo, output ) => {
        const { workflowId: id, workflowType: name, startTime, memo: { executionContext } } = workflowInfo;
        messageBus.emit( BusEventType.WORKFLOW_END, { id, name, duration: Date.now() - startTime.getTime() } );
        if ( executionContext ) { // filters out internal workflows
          Tracing.addEventEnd( { id, details: output, executionContext } );
        }
      },
      callDuringReplay: false
    },

    error: {
      fn: ( workflowInfo, error ) => {
        const { workflowId: id, workflowType: name, startTime, memo: { executionContext } } = workflowInfo;
        messageBus.emit( BusEventType.WORKFLOW_ERROR, { id, name, error, duration: Date.now() - startTime.getTime() } );
        if ( executionContext ) { // filters out internal workflows
          Tracing.addEventError( { id, details: error, executionContext } );
        }
      },
      callDuringReplay: false
    }
  },

  /**
   * Generic trace sinks
   */
  trace: {
    start: {
      fn: ( workflowInfo, { id, name, kind, details } ) => {
        const { memo: { executionContext, parentId } } = workflowInfo;
        Tracing.addEventStart( { id, kind, name, details, parentId, executionContext } );
      },
      callDuringReplay: false
    },

    end: {
      fn: ( workflowInfo, { id, details } ) => {
        const { memo: { executionContext } } = workflowInfo;
        Tracing.addEventEnd( { id, details, executionContext } );
      },
      callDuringReplay: false
    },

    error: {
      fn: ( workflowInfo, { id, details } ) => {
        const { memo: { executionContext } } = workflowInfo;
        Tracing.addEventError( { id, details, executionContext } );
      },
      callDuringReplay: false
    }
  }
};
