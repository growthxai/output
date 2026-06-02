import { inWorkflowContext, workflowInfo } from '@temporalio/workflow';

export class TraceInfo {

  /**
   * Builds the trace information propagated through workflow memo and activity headers.
   * @param {object} options - Arguments to build trace information
   * @param {boolean} options.disableTrace - Whether trace event emission should be disabled
   * @returns {object} trace information
   */
  static build( { disableTrace } ) {
    const info = inWorkflowContext() ? workflowInfo() : {};
    return {
      workflowId: info.workflowId,
      workflowType: info.workflowType,
      runId: info.runId,
      startTime: info.startTime?.getTime(),
      disableTrace
    };
  };
}
