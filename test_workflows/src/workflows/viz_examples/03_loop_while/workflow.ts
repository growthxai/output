// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';
import { initialize, processIteration, incrementCounter, finalizeResult } from './steps.js';

export default workflow( {
  name: 'loopWhile',
  inputSchema: z.object( {
    startValue: z.union( [ z.number(), z.null() ] ).optional()
  } ).passthrough(),
  outputSchema: z.number(),
  fn: async input => {
    let counter = 0;
    let accumulator = 0;

    // Initialize before loop
    const initData = await initialize( input.startValue );
    counter = initData.counter;
    accumulator = initData.accumulator;

    // While loop with condition
    while ( counter < 10 ) {
      accumulator = await processIteration( { accumulator, counter } ) as number;

      counter = await incrementCounter( counter ) as number;
    }

    // Finalize after loop
    const result = await finalizeResult( accumulator );

    return result;
  }
} );
