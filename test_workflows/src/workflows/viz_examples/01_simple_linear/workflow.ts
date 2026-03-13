// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';
import { initializeData, processData, finalizeResult } from './steps.js';

export default workflow( {
  name: 'simpleLinear',
  outputSchema: z.number(),
  fn: async () => {
    // Step 1: Initialize data
    const data = await initializeData();

    // Step 2: Process data
    const processed = await processData( data );

    // Step 3: Finalize result
    const result = await finalizeResult( processed );

    return result;
  }
} );
