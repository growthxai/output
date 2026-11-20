import { describe, it, expect } from 'vitest';
import { DatasetSchema } from './schemas.js';

describe( 'DatasetSchema', () => {
  it( 'loads a dataset file whose last_output still has the removed executionTimeMs, and drops the key', () => {
    const dataset = DatasetSchema.parse( {
      name: 'case_1',
      input: { q: 'hello' },
      last_output: { output: { result: 42 }, executionTimeMs: 100, date: '2026-01-01T00:00:00.000Z' }
    } );

    expect( dataset.last_output ).toEqual( { output: { result: 42 }, date: '2026-01-01T00:00:00.000Z' } );
  } );

  it( 'keeps a last_output of only the output and the date', () => {
    const lastOutput = { output: { result: 42 }, date: '2026-01-01T00:00:00.000Z' };

    expect( DatasetSchema.parse( { name: 'case_1', input: {}, last_output: lastOutput } ).last_output ).toEqual( lastOutput );
  } );

  it( 'keeps unknown top-level fields', () => {
    expect( DatasetSchema.parse( { name: 'case_1', input: {}, notes: 'kept' } ) ).toMatchObject( { notes: 'kept' } );
  } );
} );
