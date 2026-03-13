// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { workflow, z } from '@outputai/core';

import {
  handleEmptyInput,
  loadSettings,
  processBatch,
  handlePriorityItem,
  handleHighValueItem,
  logRetry,
  handleBatchFailure,
  generateSummary
} from './steps.js';

export default workflow( {
  name: 'complexWorkflow',
  inputSchema: z.object( {
    items: z.array( z.object( {
      type: z.string(),
      value: z.number()
    } ) ),
    config: z.object( {
      batchSize: z.number(),
      retryCount: z.number(),
      timeout: z.number()
    } ).partial().optional()
  } ).passthrough(),
  outputSchema: z.object( {
    success: z.boolean(),
    summary: z.object( {
      total: z.number(),
      priority: z.number(),
      highValue: z.number(),
      regular: z.number()
    } ).strict(),
    results: z.array( z.object( {} ).passthrough() )
  } ).strict(),
  fn: async input => {
    const items = input.items || [];
    const config = input.config || {};
    const results = [];

    // Initial validation
    if ( items.length === 0 ) {
      return handleEmptyInput();
    }

    // Pre-processing setup
    const settings: any = await loadSettings( config );

    // Process items in batches
    for ( let i = 0; i < items.length; i += settings.batchSize ) {
      const batch: any[] = items.slice( i, i + settings.batchSize );
      let retries: number = 0;
      let batchSuccess: boolean = false;

      // Retry logic for batch processing
      while ( retries < settings.retryCount && !batchSuccess ) {
        const batchResult = await processBatch( batch );

        // Validate batch results
        if ( batchResult && batchResult.length === batch.length ) {
          batchSuccess = true;

          // Post-process successful batch
          for ( const result of batchResult ) {
            if ( result.priority ) {
              const priorityResult = await handlePriorityItem( result );
              results.push( priorityResult );
            } else if ( result.highValue ) {
              const highValueResult = await handleHighValueItem( result );
              results.push( highValueResult );
            } else {
              results.push( result );
            }
          }
        } else {
          retries++;
          if ( retries < settings.retryCount ) {
            await logRetry( { batchNum: ( i / settings.batchSize ) + 1, retries } );
          }
        }
      }

      // Handle failed batch after all retries
      if ( !batchSuccess ) {
        const failureResult = await handleBatchFailure( {
          batchIndex: ( i / settings.batchSize ),
          batch
        } );
        return failureResult;
      }
    }

    // Aggregate and finalize results
    const summary = await generateSummary( results );

    return {
      success: true,
      summary,
      results
    };
  }
} );
