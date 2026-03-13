// @ts-nocheck - These are test fixtures for visualization, not real workflows
import { step, z } from '@outputai/core';

export const handleCreate = step( {
  name: 'handleCreate',
  outputSchema: z.string(),
  fn: async () => {
    return 'Creating new resource';
  }
} );

export const handleUpdate = step( {
  name: 'handleUpdate',
  outputSchema: z.string(),
  fn: async () => {
    return 'Updating existing resource';
  }
} );

export const handleDelete = step( {
  name: 'handleDelete',
  outputSchema: z.string(),
  fn: async () => {
    return 'Deleting resource';
  }
} );

export const handleRead = step( {
  name: 'handleRead',
  outputSchema: z.string(),
  fn: async () => {
    return 'Reading resource data';
  }
} );

export const handleDefault = step( {
  name: 'handleDefault',
  outputSchema: z.string(),
  fn: async () => {
    return 'Unknown action';
  }
} );
