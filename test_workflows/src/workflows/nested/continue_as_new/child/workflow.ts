import { workflow, z } from '@outputai/core';
import httpSimple from '../../../http_simple/workflow.js';

export default workflow( {
  name: 'nested_continue_as_new_child',
  description: 'Continue as new invoking a child workflow',
  inputSchema: z.object( {
    results: z.array( z.string() )
  } ),
  outputSchema: z.object( {
    results: z.array( z.string() )
  } ),
  fn: async ( input, context ) => {
    const status = await httpSimple();
    const results = input.results.slice();

    results.push( status );

    if ( results.length < 3 ) {
      return context.control.continueAsNew( { results } );
    }

    return { results };
  }
} );
