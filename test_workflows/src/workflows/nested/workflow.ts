import { workflow, z } from '@outputai/core';
import { generateNumber } from './steps.js';
import simpleWorkflow from '../simple/workflow.js';
import sharedWorkflow from '../shared_demo/workflow.js';
import slowWorkflow from '../slow/workflow.js';

export default workflow( {
  name: 'nested',
  description: 'A workflow to test nested (child) workflows',
  inputSchema: z.object( {
    value: z.number()
  } ),
  outputSchema: z.object( {
    values: z.array( z.number() ),
    summations: z.array( z.number() ),
    sharedResults: z.array( z.number() )
  } ),
  fn: async input => {
    const number1 = await generateNumber();
    const number2 = await generateNumber();

    const values = [ input.value, number1, number2 ];

    const summations : number[] = [];
    const sharedResults : number[] = [];

    // call workflow with input and options
    summations.push( ( await simpleWorkflow( { values }, {
      options: {
        retry: {
          maximumAttempts: 1
        }
      }
    } ) ).result );

    // call workflow with input only
    summations.push( ( await simpleWorkflow( { values } ) ).result );

    // call workflow with options only
    sharedResults.push( ...( await sharedWorkflow( undefined, {
      options: {
        retry: {
          maximumAttempts: 99
        }
      }
    } ) ) );

    // call workflow without any arguments
    sharedResults.push( ...( await sharedWorkflow() ) );

    // call in fire and forget mode
    slowWorkflow( undefined, { detached: true } );

    // call attached but don't await
    slowWorkflow( undefined, { detached: false } );

    return { values, summations, sharedResults };
  }
} );
