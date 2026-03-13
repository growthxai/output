// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

export const handlePositive = step( {
  name: 'handlePositive',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async value => {
    return value * 2;
  }
} );

export const handleLargeValue = step( {
  name: 'handleLargeValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Large positive value';
  }
} );

export const handleSmallValue = step( {
  name: 'handleSmallValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Small positive value';
  }
} );

export const handleNegative = step( {
  name: 'handleNegative',
  inputSchema: z.number(),
  outputSchema: z.number(),
  fn: async value => {
    return Math.abs( value );
  }
} );

export const handleZero = step( {
  name: 'handleZero',
  outputSchema: z.string(),
  fn: async () => {
    return 'Value is zero';
  }
} );
