export interface CredentialsGlobalContext {
  environment: string | undefined;
}

export interface CredentialsWorkflowContext {
  workflowName: string;
  workflowDir: string | undefined;
  environment?: string | undefined;
}

export interface CredentialsProvider {
  loadGlobal( context: CredentialsGlobalContext ): Record<string, unknown>;
  loadForWorkflow( context: CredentialsWorkflowContext ): Record<string, unknown> | null;
}
