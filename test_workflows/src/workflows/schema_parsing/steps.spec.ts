import { describe, it, expect } from 'vitest';
import { formatLabel, scaleValue } from './steps.js';

describe( 'schema_parsing steps', () => {
  describe( 'scaleValue', () => {
    it( 'coerces input, applies defaults, strips unknown output fields, and fills output defaults', async () => {
      // Cast: exercise runtime stripping of unknown input keys (not part of z.input).
      const result = await scaleValue( {
        value: '3',
        extra: 'stripped-from-input'
      } as { value: string } );

      expect( result ).toEqual( { product: 30, unit: 'x' } );
    } );

    it( 'uses input defaults when fields are omitted', async () => {
      const result = await scaleValue( {} );

      expect( result ).toEqual( { product: 10, unit: 'x' } );
    } );
  } );

  describe( 'formatLabel', () => {
    it( 'transforms input then output', async () => {
      const result = await formatLabel( '  Hello World  ' );

      expect( result ).toBe( 'label:hello world' );
    } );
  } );
} );
