const EVAL_SUFFIX = '_eval';

export const getEvalWorkflowName = ( workflowName: string ): string =>
  `${workflowName}${EVAL_SUFFIX}`;
