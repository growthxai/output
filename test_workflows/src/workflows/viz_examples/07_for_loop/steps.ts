// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

export const initializeSum = step( {
  name: 'initializeSum',
  outputSchema: z.number(),
  fn: async () => {
    return 0;
  }
} );

export const processItem = step( {
  name: 'processItem',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async item => {
    return item * 2;
  }
} );

export const addToSum = step( {
  name: 'addToSum',
  inputSchema: z.object( {
    sum: z.number(),
    processed: z.number()
  } ).strict(),
  outputSchema: z.number(),
  fn: async data => {
    return data.sum + data.processed;
  }
} );

export const calculateAverage = step( {
  name: 'calculateAverage',
  inputSchema: z.object( {
    sum: z.number(),
    length: z.number()
  } ).strict(),
  outputSchema: z.number(),
  fn: async data => {
    return data.sum / data.length;
  }
} );
