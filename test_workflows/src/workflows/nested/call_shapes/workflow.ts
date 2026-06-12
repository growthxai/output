import { sleep, workflow, z } from '@outputai/core';
import child from './child/workflow.js';
import childNoArgs from './child_no_args/workflow.js';
import childSleep from './child_sleep/workflow.js';

export default workflow( {
  name: 'nested_call_shapes',
  description: 'All possible nested workflow call shapes',
  outputSchema: z.object( {
    numbers: z.array( z.number() )
  } ),
  fn: async () => {
    const numbers : number[] = [];

    // call workflow with input only
    numbers.push( await child( { seed: 5000 } ) );

    // call workflow with input and options
    numbers.push( await child( { seed: 5000 }, {
      activityOptions: {
        retry: {
          maximumAttempts: 1
        }
      }
    } ) );

    // call workflow with options only
    numbers.push( await childNoArgs( undefined, {
      activityOptions: {
        retry: {
          maximumAttempts: 99
        }
      }
    } ) );

    // call workflow without any arguments
    numbers.push( await childNoArgs() );

    // call in fire and forget mode
    childSleep( undefined, { detached: true } );

    // call attached but don't await
    childSleep( undefined, { detached: false } );

    // Give Temporal a workflow task turn to schedule both child starts.
    await sleep( '3s' );

    return { numbers };
  }
} );
