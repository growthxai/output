// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

export const initialize = step( {
  name: 'initialize',
  inputSchema: z.union( [ z.number(), z.null() ] ),
  outputSchema: z.object( {
    counter: z.number(),
    accumulator: z.number()
  } ).strict(),
  fn: async startValue => {
    return {
      counter: startValue || 0,
      accumulator: 0
    };
  }
} );

export const processIteration = step( {
  name: 'processIteration',
  inputSchema: z.object( {
    accumulator: z.number(),
    counter: z.number()
  } ).strict(),
  outputSchema: z.number(),
  fn: async data => {
    return data.accumulator + data.counter;
  }
} );

export const incrementCounter = step( {
  name: 'incrementCounter',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async counter => {
    return counter + 1;
  }
} );

export const finalizeResult = step( {
  name: 'finalizeResult',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async accumulator => {
    return accumulator;
  }
} );
