import { workflow } from '@outputai/core';
import httpWorkflow from '../http/workflow.js';

export default workflow( {
  name: 'nested_http',
  description: 'A workflow to test nested http workflows',
  fn: async () => {
    await httpWorkflow();
  }
} );
