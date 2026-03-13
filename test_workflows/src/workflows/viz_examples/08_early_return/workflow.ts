// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';

import {
  handleMissingInput,
  handleSkip,
  handleInvalidValue,
  handleLargeValue,
  processNormalValue,
  finalizeResult
} from './steps.js';

export default workflow( {
  name: 'earlyReturn',
  inputSchema: z.object( {
    data: z.object( {
      skipProcessing: z.boolean().optional(),
      value: z.number()
    } ).passthrough()
  } ).passthrough(),
  outputSchema: z.union( [ z.number(), z.string() ] ),
  fn: async input => {
    // Validate input early
    if ( !input || !input.data ) {
      return handleMissingInput();
    }

    const data = input.data;

    // Check for special cases
    if ( data.skipProcessing ) {
      return handleSkip();
    }

    // Validate data range
    if ( data.value < 0 ) {
      return handleInvalidValue();
    }

    if ( data.value > 1000 ) {
      return handleLargeValue();
    }

    // Normal processing path
    const processed = await processNormalValue( data.value );

    const result = await finalizeResult( processed );

    return result;
  }
} );
