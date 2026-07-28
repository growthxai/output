import { workflow } from '@outputai/core';

export default workflow( {
  name: 'error_workflow',
  description: 'A workflow to test root workflow errors',
  fn: async () => {
    throw new Error( 'I am error' );
  }
} );
