import { step } from '@outputai/core';
import { createTemporalClient, getCurrentWorkflowHandle } from '@outputai/core/temporal';

export const testTemporalClient = step( {
  name: 'testTemporalClient',
  description: 'Test activity-side Temporal client access',
  fn: async () => {
    const currentHandle = getCurrentWorkflowHandle();
    await currentHandle.signal( 'currentHandleReady' );

    const client = createTemporalClient();
    const clientHandle = client.workflow.getHandle( currentHandle.workflowId );
    await clientHandle.signal( 'clientReady' );
  }
} );
