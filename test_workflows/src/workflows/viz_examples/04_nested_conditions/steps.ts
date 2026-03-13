// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

export const handleVipPremium = step( {
  name: 'handleVipPremium',
  outputSchema: z.string(),
  fn: async () => {
    return 'VIP Premium customer with high value';
  }
} );

export const handlePremiumHighValue = step( {
  name: 'handlePremiumHighValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Premium customer with high value';
  }
} );

export const handlePremiumMidValue = step( {
  name: 'handlePremiumMidValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Premium customer with medium value';
  }
} );

export const handlePremiumLowValue = step( {
  name: 'handlePremiumLowValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Premium customer with low value';
  }
} );

export const handleStandardHighValue = step( {
  name: 'handleStandardHighValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Standard customer with high value';
  }
} );

export const handleStandardLowValue = step( {
  name: 'handleStandardLowValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Standard customer with low value';
  }
} );

export const handleUnknownWithValue = step( {
  name: 'handleUnknownWithValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Unknown category with value';
  }
} );

export const handleUnknownNoValue = step( {
  name: 'handleUnknownNoValue',
  outputSchema: z.string(),
  fn: async () => {
    return 'Unknown category without value';
  }
} );
