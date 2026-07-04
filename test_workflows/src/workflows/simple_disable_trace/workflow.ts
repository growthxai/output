import { workflow, z } from '@outputai/core';
import { sumValues } from './steps.js';

export default workflow( {
  name: 'simple_disable_trace',
  description: 'A simple workflow w trace disabled',
  inputSchema: z.object( {
    values: z.array( z.number() )
  } ),
  outputSchema: z.object( {
    result: z.number(),
    workflowId: z.string()
  } ),
  fn: async ( input, context ) => {
    const result = await sumValues( input.values );
    return { result, workflowId: context.info.workflowId };
  },
  options: {
    disableTrace: true
  }
} );
