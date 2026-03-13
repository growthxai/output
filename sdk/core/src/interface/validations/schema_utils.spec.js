import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import the actual implementations
import { isZodSchema } from './schema_utils.js';

describe( 'Schema Detection', () => {
  describe( 'isZodSchema', () => {
    it( 'should correctly identify Zod schemas', () => {
      const zodSchema = z.object( {
        name: z.string(),
        age: z.number()
      } );

      expect( isZodSchema( zodSchema ) ).toBe( true );
    } );

    it( 'should correctly identify Zod string schema', () => {
      const zodString = z.string();
      expect( isZodSchema( zodString ) ).toBe( true );
    } );

    it( 'should correctly identify Zod array schema', () => {
      const zodArray = z.array( z.number() );
      expect( isZodSchema( zodArray ) ).toBe( true );
    } );

    it( 'should correctly identify Zod union schema', () => {
      const zodUnion = z.union( [ z.string(), z.number() ] );
      expect( isZodSchema( zodUnion ) ).toBe( true );
    } );

    it( 'should return false for JSON Schema objects', () => {
      const jsonSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: [ 'name' ]
      };

      expect( isZodSchema( jsonSchema ) ).toBe( false );
    } );

    it( 'should return false for plain objects', () => {
      expect( isZodSchema( {} ) ).toBe( false );
      expect( isZodSchema( { type: 'string' } ) ).toBe( false );
    } );

    it( 'should return false for null and undefined', () => {
      expect( isZodSchema( null ) ).toBeFalsy();
      expect( isZodSchema( undefined ) ).toBeFalsy();
    } );

    it( 'should return false for primitive values', () => {
      expect( isZodSchema( 'string' ) ).toBe( false );
      expect( isZodSchema( 123 ) ).toBe( false );
      expect( isZodSchema( true ) ).toBe( false );
    } );

    it( 'should return false for arrays', () => {
      expect( isZodSchema( [] ) ).toBe( false );
      expect( isZodSchema( [ 1, 2, 3 ] ) ).toBe( false );
    } );
  } );
} );
