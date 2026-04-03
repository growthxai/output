import { workflow, z } from '@outputai/core';
import { sumValues } from './steps.js';

export default workflow( {
  name: 'simple_alias',
  description: 'Demonstrates workflow aliases for backward-compatible renaming',
  aliases: [ 'simple_v1', 'simple_original' ],
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
    activityOptions: {
      scheduleToCloseTimeout: '2m',
      retry: {
        maximumAttempts: 99
      }
    }
  }
} );
