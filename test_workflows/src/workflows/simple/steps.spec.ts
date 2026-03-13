import { describe, it, expect } from 'vitest'; // Optional if globals: true
import { sumValues } from './steps.js';

describe( 'Summarize Step Spec', () => {
  it( 'should sum all received values', async () => {
    const result = await sumValues( [ 10, 15, 20 ] );

    expect( result ).toBe( 45 );
  } );
} );
