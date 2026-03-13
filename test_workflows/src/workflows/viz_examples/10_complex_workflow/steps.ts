// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

export const handleEmptyInput = step( {
  name: 'handleEmptyInput',
  outputSchema: z.object( {
    error: z.string()
  } ).strict(),
  fn: async () => {
    return { error: 'No items to process' };
  }
} );

export const loadSettings = step( {
  name: 'loadSettings',
  inputSchema: z.object( {
    batchSize: z.number(),
    retryCount: z.number(),
    timeout: z.number()
  } ).passthrough(),
  outputSchema: z.object( {
    batchSize: z.number(),
    retryCount: z.number(),
    timeout: z.number()
  } ).strict(),
  fn: async config => {
    return {
      batchSize: config.batchSize || 10,
      retryCount: config.retryCount || 3,
      timeout: config.timeout || 5000
    };
  }
} );

export const processBatch = step( {
  name: 'processBatch',
  inputSchema: z.array( z.object( {
    type: z.string(),
    value: z.number()
  } ) ),
  outputSchema: z.array( z.object( {
    processed: z.boolean(),
    priority: z.boolean(),
    highValue: z.boolean()
  } ) ),
  fn: async batch => {
    // Simulate batch processing
    return batch.map( item => {
      if ( item.type === 'priority' ) {
        return { ...item, processed: true, priority: true };
      } else if ( item.value > 100 ) {
        return { ...item, processed: true, highValue: true };
      } else {
        return { ...item, processed: true };
      }
    } );
  }
} );

export const handlePriorityItem = step( {
  name: 'handlePriorityItem',
  inputSchema: z.object( {} ),
  outputSchema: z.object( {} ),
  fn: async result => {
    return { ...result, expedited: true };
  }
} );

export const handleHighValueItem = step( {
  name: 'handleHighValueItem',
  inputSchema: z.object( {} ),
  outputSchema: z.object( {} ),
  fn: async result => {
    return { ...result, verified: true };
  }
} );

export const logRetry = step( {
  name: 'logRetry',
  inputSchema: z.object( {
    batchNum: z.number(),
    retries: z.number()
  } ).strict(),
  outputSchema: z.string(),
  fn: async data => {
    return `Retrying batch ${data.batchNum}, attempt ${data.retries}`;
  }
} );

export const handleBatchFailure = step( {
  name: 'handleBatchFailure',
  inputSchema: z.object( {
    batchIndex: z.number(),
    batch: z.array( z.object( {} ) )
  } ).strict(),
  outputSchema: z.object( {
    error: z.string(),
    batchIndex: z.number(),
    items: z.array( z.object( {} ) )
  } ).strict(),
  fn: async data => {
    return {
      error: 'Batch processing failed',
      batchIndex: data.batchIndex,
      items: data.batch
    };
  }
} );

export const generateSummary = step( {
  name: 'generateSummary',
  inputSchema: z.array( z.object( {
    priority: z.boolean(),
    highValue: z.boolean()
  } ) ),
  outputSchema: z.object( {
    total: z.number(),
    priority: z.number(),
    highValue: z.number(),
    regular: z.number()
  } ).strict(),
  fn: async results => {
    return {
      total: results.length,
      priority: results.filter( r => r.priority ).length,
      highValue: results.filter( r => r.highValue ).length,
      regular: results.filter( r => !r.priority && !r.highValue ).length
    };
  }
} );
