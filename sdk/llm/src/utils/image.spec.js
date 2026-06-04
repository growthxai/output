import { describe, it, expect } from 'vitest';
import { calculateBase64FileSize } from './image.js';

describe( 'calculateBase64FileSize', () => {
  it( 'calculates size for base64 without padding', () => {
    expect( calculateBase64FileSize( 'TWFu' ) ).toBe( 3 );
  } );

  it( 'calculates size for base64 with one padding character', () => {
    expect( calculateBase64FileSize( 'TWE=' ) ).toBe( 2 );
  } );

  it( 'calculates size for base64 with two padding characters', () => {
    expect( calculateBase64FileSize( 'TQ==' ) ).toBe( 1 );
  } );

  it( 'returns zero for an empty string', () => {
    expect( calculateBase64FileSize( '' ) ).toBe( 0 );
  } );
} );
