// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';
import { handlePositive, handleLargeValue, handleSmallValue, handleNegative, handleZero } from './steps.js';

export default workflow( {
  name: 'conditionalBranching',
  inputSchema: z.object( {
    value: z.number()
  } ).passthrough(),
  outputSchema: z.union( [ z.string(), z.number() ] ),
  fn: async input => {
    const value = input.value || 0;

    // Check if value is positive or negative
    if ( value > 0 ) {
      const positiveResult = await handlePositive( value );

      if ( positiveResult > 100 ) {
        return handleLargeValue();
      } else {
        return handleSmallValue();
      }
    } else if ( value < 0 ) {
      return handleNegative( value );
    } else {
      return handleZero();
    }
  }
} );
