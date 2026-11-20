import { describe, expect, it } from 'vitest';
import { parseModelsDevData } from './parser.js';

const cost = { input: 1, output: 2 };

describe( 'parseModelsDevData', () => {
  it( 'maps provider/model keys and keeps cost plus reasoning', () => {
    const result = parseModelsDevData( {
      openai: {
        models: {
          'gpt-4o': { cost, reasoning: true },
          'gpt-mini': { cost: { input: 0.1, output: 0.4 }, reasoning: false }
        }
      }
    } );

    expect( result ).toBeInstanceOf( Map );
    expect( result.get( 'openai/gpt-4o' ) ).toEqual( { cost, reasoning: true } );
    expect( result.get( 'openai/gpt-mini' ) ).toEqual( {
      cost: { input: 0.1, output: 0.4 },
      reasoning: false
    } );
  } );

  it( 'keeps the same model id distinct across providers', () => {
    const result = parseModelsDevData( {
      openai: { models: { shared: { cost: { input: 1, output: 2 } } } },
      azure: { models: { shared: { cost: { input: 3, output: 4 } } } }
    } );

    expect( result.get( 'openai/shared' ) ).toEqual( { cost: { input: 1, output: 2 }, reasoning: false } );
    expect( result.get( 'azure/shared' ) ).toEqual( { cost: { input: 3, output: 4 }, reasoning: false } );
    expect( result.get( 'shared' ) ).toBeUndefined();
  } );

  it( 'skips _meta and models without cost', () => {
    const result = parseModelsDevData( {
      _meta: { createdAt: '2026-01-01T00:00:00.000Z' },
      openai: {
        models: {
          priced: { cost, reasoning: true },
          unpriced: { reasoning: false }
        }
      }
    } );

    expect( result.size ).toBe( 1 );
    expect( result.get( 'openai/priced' ) ).toEqual( { cost, reasoning: true } );
    expect( result.has( 'openai/unpriced' ) ).toBe( false );
  } );

  it( 'treats a missing models object as empty for that provider', () => {
    const result = parseModelsDevData( {
      empty: {},
      openai: { models: { priced: { cost } } }
    } );

    expect( result.size ).toBe( 1 );
    expect( result.get( 'openai/priced' ) ).toEqual( { cost, reasoning: false } );
  } );

  it( 'coerces non-true reasoning values to false', () => {
    const result = parseModelsDevData( {
      openai: {
        models: {
          a: { cost, reasoning: 'yes' },
          b: { cost, reasoning: 1 },
          c: { cost }
        }
      }
    } );

    expect( result.get( 'openai/a' ).reasoning ).toBe( false );
    expect( result.get( 'openai/b' ).reasoning ).toBe( false );
    expect( result.get( 'openai/c' ).reasoning ).toBe( false );
  } );

  it( 'throws when nothing priced remains', () => {
    expect( () => parseModelsDevData( {
      _meta: {},
      openai: { models: { unpriced: {} } }
    } ) ).toThrow( 'Empty response' );

    expect( () => parseModelsDevData( {} ) ).toThrow( 'Empty response' );
  } );
} );
