// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';
import { initializeSum, processItem, calculateAverage } from './steps.js';

export default workflow( {
  name: 'forLoop',
  inputSchema: z.object( {
    items: z.array( z.number() )
  } ).passthrough(),
  outputSchema: z.number(),
  fn: async input => {
    const items = input.items || [ 1, 2, 3, 4, 5 ];
    let sum = 0;

    // Initialize sum
    sum = initializeSum();

    // For loop to process items
    for ( let i = 0; i < items.length; i++ ) {
      const item = items[i];

      // Process each item
      const processed = await processItem( item );

      // Add to sum
      sum = addToSum( { sum, processed } );
    }

    // Calculate average
    const average = calculateAverage( { sum, length: items.length } );

    return average;
  }
} );
