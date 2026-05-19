import { workflow } from '@outputai/core';
import httpErrorWorkflow from '../http_error/workflow.js';

export default workflow( {
  name: 'nested_http_error',
  description: 'A workflow to test nested http error workflows',
  fn: async () => {
    await httpErrorWorkflow();
  }
} );
