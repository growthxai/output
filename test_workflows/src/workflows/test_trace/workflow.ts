import { workflow, z } from '@outputai/core';
import { assertTrace, runWorkflow } from './steps.js';
import { sleep } from '@temporalio/workflow';

export default workflow( {
  name: 'test_trace',
  description: 'Runs a nested workflow and validates its local trace',
  outputSchema: z.object( {
    passed: z.boolean()
  } ),
  fn: async () => {
    const workflowId = await runWorkflow();
    await sleep( '10s' );
    await assertTrace( workflowId );
    return { passed: true };
  }
} );
