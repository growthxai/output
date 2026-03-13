import { workflow, z } from '@outputai/core';
import { increment } from './steps.js';

export default workflow( {
  name: 'continue_as_new',
  description: 'Testing continue as new feature',
  inputSchema: z.object( {
    value: z.number()
  } ),
  outputSchema: z.object( {
    result: z.number()
  } ),
  fn: async ( input, context ) => {
    const result = await increment( input.value );

    if ( result < 3 ) {
      return context.control.continueAsNew( { value: result } );
    }

    return { result };
  }
} );
