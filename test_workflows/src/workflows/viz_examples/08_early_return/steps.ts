// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

export const handleMissingInput = step( {
  name: 'handleMissingInput',
  outputSchema: z.object( {
    error: z.string()
  } ).strict(),
  fn: async () => {
    return { error: 'Input data is required' };
  }
} );

export const handleSkip = step( {
  name: 'handleSkip',
  outputSchema: z.object( {
    result: z.string()
  } ).strict(),
  fn: async () => {
    return { result: 'Processing skipped' };
  }
} );

export const handleInvalidValue = step( {
  name: 'handleInvalidValue',
  outputSchema: z.object( {
    error: z.string()
  } ).strict(),
  fn: async () => {
    return { error: 'Value must be non-negative' };
  }
} );

export const handleLargeValue = step( {
  name: 'handleLargeValue',
  outputSchema: z.object( {
    warning: z.string(),
    capped: z.number()
  } ).strict(),
  fn: async () => {
    return { warning: 'Value exceeds maximum', capped: 1000 };
  }
} );

export const processNormalValue = step( {
  name: 'processNormalValue',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async value => {
    return value * 2;
  }
} );

export const finalizeResult = step( {
  name: 'finalizeResult',
  inputSchema: z.number(),
  outputSchema: z.object( {
    success: z.boolean(),
    result: z.number()
  } ).strict(),
  fn: async processed => {
    return { success: true, result: processed };
  }
} );
