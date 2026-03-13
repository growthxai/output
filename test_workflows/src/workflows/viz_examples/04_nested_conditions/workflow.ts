// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';
import {
  handleVipPremium,
  handlePremiumHighValue,
  handlePremiumMidValue,
  handlePremiumLowValue,
  handleStandardHighValue,
  handleStandardLowValue,
  handleUnknownWithValue,
  handleUnknownNoValue
} from './steps.js';

export default workflow( {
  name: 'nestedConditions',
  inputSchema: z.object( {
    category: z.string(),
    value: z.number(),
    isVip: z.boolean().optional()
  } ).passthrough(),
  outputSchema: z.string(),
  fn: async input => {
    const category = input.category || 'unknown';
    const value = input.value || 0;

    if ( category === 'premium' ) {
      if ( value > 1000 ) {
        if ( input.isVip ) {
          return handleVipPremium();
        } else {
          return handlePremiumHighValue();
        }
      } else if ( value > 500 ) {
        return handlePremiumMidValue();
      } else {
        return handlePremiumLowValue();
      }
    } else if ( category === 'standard' ) {
      if ( value > 500 ) {
        return handleStandardHighValue();
      } else {
        return handleStandardLowValue();
      }
    } else {
      if ( value > 0 ) {
        return handleUnknownWithValue();
      } else {
        return handleUnknownNoValue();
      }
    }
  }
} );
