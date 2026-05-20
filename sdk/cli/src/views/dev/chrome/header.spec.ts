import { describe, expect, it } from 'vitest';
import { getHeight as getHeaderHeight } from './header.js';

describe( 'getHeaderHeight', () => {
  it( 'includes margin with compact height for terminals under 50 rows', () => {
    expect( getHeaderHeight( 49 ) ).toBe( 2 );
  } );

  it( 'includes margin with full height for terminals with at least 50 rows', () => {
    expect( getHeaderHeight( 50 ) ).toBe( 4 );
  } );
} );
