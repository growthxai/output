// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';
import {
  initializeResults,
  processElement,
  updateRowSum,
  updateRowMax,
  flagHighValue,
  processRowResult,
  incrementComparison,
  logComparison,
  aggregateResults
} from './steps.js';

export default workflow( {
  name: 'nestedLoops',
  inputSchema: z.object( {
    matrix: z.array( z.array( z.number() ) )
  } ).passthrough(),
  outputSchema: z.array( z.object( {
    rowIndex: z.number(),
    sum: z.number(),
    max: z.number(),
    average: z.number()
  } ).strict() ),
  fn: async input => {
    const matrix = input.matrix || [ [ 1, 2, 3 ], [ 4, 5, 6 ], [ 7, 8, 9 ] ];
    let results = [];

    // Initialize results array
    results = await initializeResults() as any[];

    // Outer loop - iterate through rows
    for ( let i = 0; i < matrix.length; i++ ) {
      const row = matrix[i];
      let rowSum = 0;
      let rowMax = Number.MIN_VALUE;

      // Inner loop - iterate through columns
      for ( let j = 0; j < row.length; j++ ) {
        const element = row[j];

        // Process each element
        const processed = await processElement( element );

        // Update row sum
        rowSum = await updateRowSum( { rowSum, processed } ) as number;

        // Check for row maximum
        if ( processed > rowMax ) {
          rowMax = await updateRowMax( processed ) as number;
        }

        // Nested condition within inner loop
        if ( processed > 10 ) {
          await flagHighValue( { i, j, processed } );
        }
      }

      // Process row results after inner loop
      const rowResult = await processRowResult( {
        rowIndex: i,
        rowSum,
        rowMax,
        rowLength: row.length
      } );

      results.push( rowResult );

      // Additional nested loop for cross-row comparison
      let crossRowComparisons: number = 0;
      for ( let k = 0; k < i; k++ ) {
        const previousRow: any = results[k];
        if ( previousRow && rowResult.sum > previousRow.sum ) {
          crossRowComparisons = await incrementComparison( crossRowComparisons ) as number;
        }
      }

      if ( crossRowComparisons > 0 ) {
        await logComparison( { i, crossRowComparisons } );
      }
    }

    // Final aggregation
    const finalResult: any = await aggregateResults( results );

    return finalResult;
  }
} );
