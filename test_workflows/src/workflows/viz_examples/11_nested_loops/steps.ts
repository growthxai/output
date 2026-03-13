// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

export const initializeResults = step( {
  name: 'initializeResults',
  outputSchema: z.array( z.object( {} ) ),
  fn: async () => {
    return [];
  }
} );

export const processElement = step( {
  name: 'processElement',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async element => {
    return element * 2;
  }
} );

export const updateRowSum = step( {
  name: 'updateRowSum',
  inputSchema: z.object( {
    rowSum: z.number(),
    processed: z.number()
  } ).strict(),
  outputSchema: z.number(),
  fn: async data => {
    return data.rowSum + data.processed;
  }
} );

export const updateRowMax = step( {
  name: 'updateRowMax',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async processed => {
    return processed;
  }
} );

export const flagHighValue = step( {
  name: 'flagHighValue',
  inputSchema: z.object( {
    i: z.number(),
    j: z.number(),
    processed: z.number()
  } ).strict(),
  outputSchema: z.string(),
  fn: async data => {
    return `High value found at [${data.i}][${data.j}]: ${data.processed}`;
  }
} );

export const processRowResult = step( {
  name: 'processRowResult',
  inputSchema: z.object( {
    rowIndex: z.number(),
    rowSum: z.number(),
    rowMax: z.number(),
    rowLength: z.number()
  } ).strict(),
  outputSchema: z.object( {
    rowIndex: z.number(),
    sum: z.number(),
    max: z.number(),
    average: z.number()
  } ).strict(),
  fn: async data => {
    return {
      rowIndex: data.rowIndex,
      sum: data.rowSum,
      max: data.rowMax,
      average: data.rowSum / data.rowLength
    };
  }
} );

export const incrementComparison = step( {
  name: 'incrementComparison',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async crossRowComparisons => {
    return crossRowComparisons + 1;
  }
} );

export const logComparison = step( {
  name: 'logComparison',
  inputSchema: z.object( {
    i: z.number(),
    crossRowComparisons: z.number()
  } ).strict(),
  outputSchema: z.string(),
  fn: async data => {
    return `Row ${data.i} has higher sum than ${data.crossRowComparisons} previous rows`;
  }
} );

export const aggregateResults = step( {
  name: 'aggregateResults',
  inputSchema: z.array( z.object( {
    sum: z.number(),
    max: z.number()
  } ) ),
  outputSchema: z.object( {
    rows: z.array( z.object( {} ) ),
    totalSum: z.number(),
    maxValue: z.number(),
    averagePerRow: z.number()
  } ).strict(),
  fn: async results => {
    const totalSum = results.reduce( ( acc, row ) => acc + row.sum, 0 );
    const maxValue = Math.max( ...results.map( row => row.max ) );
    return {
      rows: results,
      totalSum,
      maxValue,
      averagePerRow: totalSum / results.length
    };
  }
} );
