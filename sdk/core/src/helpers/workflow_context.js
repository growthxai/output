import { workflowInfo, continueAsNew, inWorkflowContext } from '@temporalio/workflow';

export class WorkflowContext {

  /**
   * Builds a new context instance
   * @returns {object} context
   */
  static build() {
    if ( !inWorkflowContext() ) {
      return {
        control: {
          continueAsNew: async () => {},
          isContinueAsNewSuggested: () => false
        },
        info: { workflowId: 'test-workflow', runId: 'test-run' }
      };
    }

    const { workflowId, runId } = workflowInfo();
    return {
      control: {
        continueAsNew,
        isContinueAsNewSuggested: () => workflowInfo().continueAsNewSuggested
      },
      info: { workflowId, runId }
    };
  }
};
