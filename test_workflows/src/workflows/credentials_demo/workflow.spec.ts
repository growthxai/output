import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readCredential, readEnvCredential } from './steps.js';

vi.mock( './steps.js', () => ( {
  readCredential: vi.fn(),
  readEnvCredential: vi.fn()
} ) );

import credentialsDemo from './workflow.js';

describe( 'credentials_demo workflow', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( readEnvCredential ).mockResolvedValue( 'hello_from_env_injection' );
  } );

  it( 'should call readCredential step and return the value', async () => {
    vi.mocked( readCredential ).mockResolvedValue( 'test-secret-value' );

    const result = await credentialsDemo( { path: 'test.secret' } );

    expect( readCredential ).toHaveBeenCalledWith( 'test.secret' );
    expect( result.directValue ).toBe( 'test-secret-value' );
    expect( result.envValue ).toBe( 'hello_from_env_injection' );
  } );

  it( 'should return null for missing credential path', async () => {
    vi.mocked( readCredential ).mockResolvedValue( null );

    const result = await credentialsDemo( { path: 'nonexistent.key' } );

    expect( readCredential ).toHaveBeenCalledWith( 'nonexistent.key' );
    expect( result.directValue ).toBeNull();
  } );

  it( 'should return numeric values', async () => {
    vi.mocked( readCredential ).mockResolvedValue( 42 );

    const result = await credentialsDemo( { path: 'test.nested.deep_value' } );

    expect( result.directValue ).toBe( 42 );
  } );
} );
