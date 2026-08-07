import { workflow, z } from '@outputai/core';
import { assertTrace, runWorkflow } from './steps.js';

export default workflow( {
  name: 'test_trace',
  description: 'Runs a nested workflow and validates its local trace',
  outputSchema: z.object( {
    passed: z.boolean()
  } ),
  fn: async () => {
    const workflowId = await runWorkflow();
    await assertTrace( workflowId );
    return { passed: true };
  },
  options: {
    activityOptions: {
      retry: {
        maximumAttempts: 1
      }
    }
  }
} );
