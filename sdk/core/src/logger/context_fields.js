/**
 * Flat execution-context fields attached to logs. Shared by the worker
 * lifecycle log hooks and the public step logger so both stay consistent.
 *
 * @param {import('@temporalio/activity').Info} activityInfo
 * @returns {{ activityId: string, activityType: string, workflowId: string, workflowType: string, runId: string }}
 */
export const serializedActivityFields = activityInfo => ( {
  activityId: activityInfo.activityId,
  activityType: activityInfo.activityType,
  workflowId: activityInfo.workflowExecution.workflowId,
  workflowType: activityInfo.workflowType,
  runId: activityInfo.workflowExecution.runId
} );
