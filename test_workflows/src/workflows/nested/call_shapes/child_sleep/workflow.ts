import { sleep, workflow } from '@outputai/core';

export default workflow( {
  name: 'call_shape_child_sleep',
  description: 'Second Level',
  fn: async () => {
    await sleep( '30s' );
  }
} );
