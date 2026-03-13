import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readCredential } from './steps.js';

vi.mock( './steps.js', () => ( {
  readCredential: vi.fn()
} ) );

import credentialsDemo from './workflow.js';

describe( 'credentials_demo workflow', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'should call readCredential step and return the value', async () => {
    vi.mocked( readCredential ).mockResolvedValue( 'test-secret-value' );

    const result = await credentialsDemo( { path: 'test.secret' } );

    expect( readCredential ).toHaveBeenCalledWith( 'test.secret' );
    expect( result.value ).toBe( 'test-secret-value' );
  } );

  it( 'should return null for missing credential path', async () => {
    vi.mocked( readCredential ).mockResolvedValue( null );

    const result = await credentialsDemo( { path: 'nonexistent.key' } );

    expect( readCredential ).toHaveBeenCalledWith( 'nonexistent.key' );
    expect( result.value ).toBeNull();
  } );

  it( 'should return numeric values', async () => {
    vi.mocked( readCredential ).mockResolvedValue( 42 );

    const result = await credentialsDemo( { path: 'test.nested.deep_value' } );

    expect( result.value ).toBe( 42 );
  } );
} );
