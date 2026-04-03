import { describe, it, expect } from 'vitest';
import { sumValues } from './steps.js';

describe( 'simple_alias steps', () => {
  it( 'should sum all received values', async () => {
    const result = await sumValues( [ 10, 15, 20 ] );

    expect( result ).toBe( 45 );
  } );
} );
