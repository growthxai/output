/**
 * Context instance builder
 */
export class Context {

  /**
   * Builds a new context instance
   * @param {object} options - Arguments to build a new context instance
   * @param {string} workflowId
   * @param {function} continueAsNew
   * @param {function} isContinueAsNewSuggested
   * @returns {object} context
   */
  static build( { workflowId, continueAsNew, isContinueAsNewSuggested } ) {
    return {
      /**
       * Control namespace: This object adds functions to interact with Temporal flow mechanisms
       */
      control: {
        continueAsNew,
        isContinueAsNewSuggested
      },
      /**
       * Info namespace: abstracts workflowInfo()
       */
      info: {
        workflowId
      }
    };
  }
};
