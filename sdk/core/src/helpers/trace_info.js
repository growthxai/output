import { inWorkflowContext, workflowInfo } from '@temporalio/workflow';

export class TraceInfo {

  /**
   * Builds the trace information propagated through workflow memo and activity headers.
   * @returns {object} trace information
   */
  static build() {
    const info = inWorkflowContext() ? workflowInfo() : {};
    return {
      workflowId: info.workflowId,
      workflowType: info.workflowType,
      runId: info.runId,
      startTime: info.startTime?.getTime()
    };
  };
}
