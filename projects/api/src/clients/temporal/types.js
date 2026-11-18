/**
 * Temporal workflow execution status codes.
 * Values correspond to temporal.api.enums.v1.WorkflowExecutionStatus protobuf enum.
 */
export const WorkflowStatus = {
  RUNNING: 1,
  COMPLETED: 2,
  FAILED: 3,
  CANCELED: 4,
  TERMINATED: 5,
  CONTINUED_AS_NEW: 6,
  TIMED_OUT: 7
};

/**
 * Return true if workflow closed its execution (any reason)
 * @param {number} c
 * @returns {boolean}
 */
export const isWorkflowClosed = c => [
  WorkflowStatus.COMPLETED,
  WorkflowStatus.FAILED,
  WorkflowStatus.CANCELED,
  WorkflowStatus.TERMINATED,
  WorkflowStatus.CONTINUED_AS_NEW,
  WorkflowStatus.TIMED_OUT
].includes( c );

// Subset of gRPC status codes from @grpc/grpc-js (transitive through @temporalio/client).
// See https://github.com/grpc/grpc/blob/master/doc/statuscodes.md
export const GrpcStatus = {
  INVALID_ARGUMENT: 3,
  NOT_FOUND: 5
};

export const formatStatus = name => name?.toLowerCase() ?? 'unspecified';
