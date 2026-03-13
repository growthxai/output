import { workflow, sendHttpRequest, z } from '@outputai/core';

export default workflow( {
  name: 'send_http_request',
  description: 'A workflow to test webhooks',
  outputSchema: z.object( {
    status: z.number()
  } ),
  fn: async () => {
    const url = 'https://dummyjson.com/posts/add';
    const method = 'POST';
    const payload = {
      title: 'I am in love with someone.',
      userId: 5
    };

    const response = await sendHttpRequest( { method, url, payload } );

    return { status: response.status };
  }
} );
