const EVAL_SUFFIX = '_eval';

export const getEvalWorkflowName = ( workflowName: string ): string =>
  `${workflowName}${EVAL_SUFFIX}`;

export const isEvalWorkflow = ( name: string ): boolean =>
  name.endsWith( EVAL_SUFFIX );

export const getParentWorkflowName = ( evalName: string ): string =>
  evalName.slice( 0, -EVAL_SUFFIX.length );
