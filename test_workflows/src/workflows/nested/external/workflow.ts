import { workflow, z } from '@outputai/core';
import { processNumbers } from '@growthxlabs/workflows_catalog';

// TEMP: catalog .d.ts still uses WorkflowFunctionWrapper<WorkflowFunction<...>>; cast until catalog is updated for core's Wrapper<In, Out>.
type ProcessNumbers = ( input: { values: number[] } ) => Promise<{ summation: number; subtraction: number }>;
const processNumbersCompat = processNumbers as unknown as ProcessNumbers;

export default workflow( {
  name: 'nested_external',
  description: 'Calling nested external workflow',
  outputSchema: z.object( {
    values: z.array( z.number() ),
    summation: z.number(),
    subtraction: z.number()
  } ),
  fn: async () => {
    const values = [ 3, 2, 1 ];

    const { summation, subtraction } = await processNumbersCompat( { values } );

    return { values, summation, subtraction };
  }
} );
