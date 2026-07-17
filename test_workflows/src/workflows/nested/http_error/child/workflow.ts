import { workflow } from '@outputai/core';
import httpError from '../../../http/http_error/workflow.js';

export default workflow( {
  name: 'nested_http_error_child',
  description: 'Second level',
  fn: async () => {
    await httpError();
  }
} );
