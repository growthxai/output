export const createWorkflowDetails = info => ( {
  attempt: info.attempt,
  continuedFromExecutionRunId: info.continuedFromExecutionRunId,
  firstExecutionRunId: info.firstExecutionRunId,
  parent: info.parent,
  root: info.root,
  runId: info.runId,
  runStartTime: info.runStartTime.getTime(),
  startTime: info.startTime.getTime(),
  workflowId: info.workflowId,
  workflowType: info.workflowType
} );
