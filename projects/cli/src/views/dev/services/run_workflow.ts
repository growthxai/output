import { postWorkflowStart, type PostWorkflowStart200 } from '#api/generated/api.js';

export interface StartedRun {
  workflowId?: string;
  runId?: string | null;
}

export interface StartWorkflowOptions {
  workflowName: string;
  input: unknown;
  taskQueue?: string;
}

export const startWorkflow = async ( opts: StartWorkflowOptions ): Promise<StartedRun> => {
  const response = await postWorkflowStart( {
    workflowName: opts.workflowName,
    input: opts.input,
    taskQueue: opts.taskQueue
  } );
  if ( response.status !== 200 ) {
    const data = response.data as { error?: string };
    throw new Error( data?.error ?? `Workflow start failed (status ${response.status})` );
  }
  const data = response.data as PostWorkflowStart200;
  return { workflowId: data.workflowId, runId: data.runId };
};
