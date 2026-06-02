import { workflow } from '@outputai/core';
import continueAsNewWorkflow from '../continue_as_new/workflow.js';

export default workflow( {
  name: 'nested_continue_as_new',
  description: 'A workflow to test nested continue as new workflows',
  fn: async () => {
    await continueAsNewWorkflow( { value: 1 } );
  }
} );
