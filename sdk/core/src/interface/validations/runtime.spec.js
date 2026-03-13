import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateWithSchema } from './runtime.js';
import { ValidationError } from '#errors';

describe( 'runtime validations', () => {
  describe( 'validateWithSchema', () => {
    it( 'no-ops when schema is falsy', () => {
      expect( () => validateWithSchema( undefined, { a: 1 }, 'X' ) ).not.toThrow();
      expect( () => validateWithSchema( null, { a: 1 }, 'X' ) ).not.toThrow();
    } );

    it( 'passes on valid data', () => {
      const schema = z.object( { a: z.string(), b: z.number().optional() } );
      expect( () => validateWithSchema( schema, { a: 'ok' }, 'Test' ) ).not.toThrow();
    } );

    it( 'throws ValidationError on invalid data and prefixes context', () => {
      const schema = z.object( { a: z.string() } );
      const call = () => validateWithSchema( schema, { a: 1 }, 'MyCtx' );
      expect( call ).toThrow( ValidationError );
      try {
        call();
      } catch ( e ) {
        expect( String( e.message ) ).toContain( 'MyCtx validation failed:' );
      }
    } );
  } );
} );
