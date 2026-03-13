/**
 * Workflow runs service for fetching workflow run data from the API
 */
import { getWorkflowRuns, type WorkflowRunInfo, type WorkflowRunsResponse } from '#api/generated/api.js';

export type WorkflowRun = WorkflowRunInfo;

export interface WorkflowRunsResult {
  runs: WorkflowRun[];
  count: number;
}

export interface FetchWorkflowRunsOptions {
  workflowType?: string;
  limit?: number;
}

export async function fetchWorkflowRuns( options: FetchWorkflowRunsOptions = {} ): Promise<WorkflowRunsResult> {
  const params: { workflowType?: string; limit?: number } = {};

  if ( options.limit ) {
    params.limit = options.limit;
  }

  if ( options.workflowType ) {
    params.workflowType = options.workflowType;
  }

  const response = await getWorkflowRuns( params );

  if ( !response ) {
    throw new Error( 'Failed to connect to API server. Is it running?' );
  }

  if ( !response.data ) {
    throw new Error( 'API returned invalid response (missing data)' );
  }

  const data = response.data as WorkflowRunsResponse;
  return {
    runs: data.runs || [],
    count: data.count || 0
  };
}
