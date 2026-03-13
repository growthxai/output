import { describe, it, expect, vi, beforeEach } from 'vitest';

const FAKE_STORE: Record<string, unknown> = {
  'test.secret': 'credentials_are_working',
  'test.nested.deep_value': 42
};

vi.mock( '@outputai/credentials', () => ( {
  credentials: {
    get: ( path: string, defaultValue: unknown = undefined ) =>
      FAKE_STORE[path] ?? defaultValue,
    require: ( path: string ) => {
      if ( !( path in FAKE_STORE ) ) {
        throw new Error( `Missing credential: ${path}` );
      }
      return FAKE_STORE[path];
    },
    _reset: vi.fn()
  }
} ) );

import { readCredential } from './steps.js';

describe( 'readCredential step', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'should read existing credential value', async () => {
    const result = await readCredential( 'test.secret' );
    expect( result ).toBe( 'credentials_are_working' );
  } );

  it( 'should return null for missing credential', async () => {
    const result = await readCredential( 'nonexistent.path' );
    expect( result ).toBeNull();
  } );

  it( 'should read nested numeric value', async () => {
    const result = await readCredential( 'test.nested.deep_value' );
    expect( result ).toBe( 42 );
  } );
} );
