import { workflow, z } from '@outputai/core';
import { workflowInfo } from '@temporalio/workflow';
import { callHttpWithCost } from './steps.js';

export default workflow( {
  name: 'nested_raw_execute_child_child',
  description: 'Child started with a raw executeChild',
  inputSchema: z.object( { label: z.string() } ),
  outputSchema: z.object( {
    label: z.string(),
    searchAttributes: z.record( z.string(), z.unknown() )
  } ),
  fn: async ( { label } ) => {
    const { label: echoed } = await callHttpWithCost( { label } );
    const { TemporalScheduledById, BuildIds, ...searchAttributes } = workflowInfo().searchAttributes ?? {};
    return { label: echoed, searchAttributes };
  }
} );
