export interface GlobalContext {
  environment: string | undefined;
}

export interface WorkflowContext {
  workflowName: string;
  workflowDir: string | undefined;
  environment?: string | undefined;
}

export interface CredentialsProvider {
  loadGlobal( context: GlobalContext ): Record<string, unknown>;
  loadForWorkflow( context: WorkflowContext ): Record<string, unknown> | null;
}
