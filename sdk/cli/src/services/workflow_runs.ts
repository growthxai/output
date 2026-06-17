/**
 * Workflow runs service for fetching workflow run data from the API
 */
import { getWorkflowRuns, type WorkflowRunInfo, type WorkflowRunsResponse } from '#api/generated/api.js';
import { normalizeWorkflowStatus } from '#utils/normalize_workflow_status.js';

export type WorkflowRun = WorkflowRunInfo;

export interface WorkflowRunsResult {
  runs: WorkflowRun[];
  count: number;
}

export interface FetchWorkflowRunsOptions {
  workflowType?: string;
  catalog?: string;
  limit?: number;
}

export async function fetchWorkflowRuns( options: FetchWorkflowRunsOptions = {} ): Promise<WorkflowRunsResult> {
  const params: { workflowType?: string; catalog?: string; limit?: number } = {};

  if ( options.limit ) {
    params.limit = options.limit;
  }

  if ( options.workflowType ) {
    params.workflowType = options.workflowType;
  }

  if ( options.catalog ) {
    params.catalog = options.catalog;
  }

  const response = await getWorkflowRuns( params );

  if ( !response ) {
    throw new Error( 'Failed to connect to API server. Is it running?' );
  }

  if ( !response.data ) {
    throw new Error( 'API returned invalid response (missing data)' );
  }

  const data = response.data as WorkflowRunsResponse;
  const runs = ( data.runs || [] ).map( run => ( {
    ...run,
    status: normalizeWorkflowStatus( run.status )
  } ) );
  return {
    runs,
    count: data.count || 0
  };
}
