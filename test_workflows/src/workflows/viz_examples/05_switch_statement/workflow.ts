// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';

import {
  handleCreate,
  handleUpdate,
  handleDelete,
  handleRead,
  handleDefault
} from './steps.js';

export default workflow( {
  name: 'switchStatement',
  inputSchema: z.object( {
    action: z.string()
  } ).passthrough(),
  outputSchema: z.union( [
    z.string(),
    z.null()
  ] ),
  fn: async input => {
    const action = input.action || 'default';
    let result = null;

    switch ( action ) {
    case 'create':
      result = await handleCreate();
      break;

    case 'update':
      result = await handleUpdate();
      break;

    case 'delete':
      result = await handleDelete();
      break;

    case 'read':
    case 'get':
    case 'fetch':
      result = await handleRead();
      break;

    default:
      result = await handleDefault();
      break;
    }

    return result;
  }
} );
