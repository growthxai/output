import { BusEventType, ComponentType } from '#consts';
import * as Tracing from '#tracing';
import { mainEventBus } from '#bus';
import { createWorkflowDetails } from '#helpers/temporal_context';

// This sink allow for sandbox Temporal environment to send trace logs back to the main thread.
export const sinks = {

  /**
   * Workflow lifecycle sinks
   */
  workflow: {
    log: {
      fn: ( workflowInfo, { level, message, metadata } ) => {
        mainEventBus.emit( BusEventType.WORKFLOW_LOG, { level, message, metadata, workflowDetails: createWorkflowDetails( workflowInfo ) } );
      },
      callDuringReplay: false
    },
    start: {
      fn: ( workflowInfo, input ) => {
        const { runId, workflowType, memo: { traceInfo }, parent } = workflowInfo;
        mainEventBus.emit( BusEventType.WORKFLOW_START, { workflowDetails: createWorkflowDetails( workflowInfo ) } );
        if ( traceInfo ) {
          Tracing.addEventStart( {
            id: runId,
            kind: ComponentType.WORKFLOW,
            name: workflowType,
            details: input,
            parentId: parent?.runId,
            traceInfo
          } );
        }
      },
      callDuringReplay: false
    },

    end: {
      fn: ( workflowInfo, output ) => {
        const { runId, memo: { traceInfo } } = workflowInfo;
        mainEventBus.emit( BusEventType.WORKFLOW_END, { workflowDetails: createWorkflowDetails( workflowInfo ) } );
        if ( traceInfo ) {
          Tracing.addEventEnd( { id: runId, details: output, traceInfo } );
        }
      },
      callDuringReplay: false
    },

    error: {
      fn: ( workflowInfo, error ) => {
        const { runId, memo: { traceInfo } } = workflowInfo;
        mainEventBus.emit( BusEventType.WORKFLOW_ERROR, { workflowDetails: createWorkflowDetails( workflowInfo ), error } );
        if ( traceInfo ) {
          Tracing.addEventError( { id: runId, details: error, traceInfo } );
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
      fn: ( workflowInfo, { id, name, kind, details } ) =>
        Tracing.addEventStart( { id, kind, name, details, parentId: workflowInfo.parent?.runId, traceInfo: workflowInfo.memo.traceInfo } ),
      callDuringReplay: false
    },

    end: {
      fn: ( workflowInfo, { id, details } ) => Tracing.addEventEnd( { id, details, traceInfo: workflowInfo.memo.traceInfo } ),
      callDuringReplay: false
    },

    error: {
      fn: ( workflowInfo, { id, details } ) => Tracing.addEventError( { id, details, traceInfo: workflowInfo.memo.traceInfo } ),
      callDuringReplay: false
    }
  }
};
