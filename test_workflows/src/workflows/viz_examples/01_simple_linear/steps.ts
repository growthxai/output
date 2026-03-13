// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

// Step 1: Initialize data
export const initializeData = step( {
  name: 'initializeData',
  outputSchema: z.number(),
  fn: async () => {
    return { value: 0 };
  }
} );

// Step 2: Process data
export const processData = step( {
  name: 'processData',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async data => {
    return data + 10;
  }
} );

// Step 3: Finalize result
export const finalizeResult = step( {
  name: 'finalizeResult',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async processed => {
    return processed * 2;
  }
} );
