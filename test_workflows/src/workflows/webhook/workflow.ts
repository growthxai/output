import { workflow, sendPostRequestAndAwaitWebhook, z } from '@outputai/core';

export default workflow( {
  name: 'webhook',
  description: 'A workflow to test webhooks',
  outputSchema: z.object( {
    value: z.number()
  } ),
  fn: async () => {
    const { value } = await sendPostRequestAndAwaitWebhook( { url: 'http://api:3001/heartbeat' } ) as { value: number };

    return { value };
  }
} );
