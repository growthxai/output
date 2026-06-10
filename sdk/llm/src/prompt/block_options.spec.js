import { describe, it, expect, vi } from 'vitest';
import { FatalError } from '@outputai/core';
import { attributesSchema, resolveMessageProviderOptions } from './block_options.js';

const textPrompt = ( { config = {}, messages } ) => ( {
  name: 'test@v1',
  config: { provider: 'anthropic', model: 'claude-sonnet-4-5', ...config },
  messages
} );

describe( 'attributesSchema', () => {
  it( 'accepts known attributes with valid values', () => {
    expect( attributesSchema.safeParse( { cache: true } ).success ).toBe( true );
    expect( attributesSchema.safeParse( { cache: '1h' } ).success ).toBe( true );
    expect( attributesSchema.safeParse( { options: 'a b' } ).success ).toBe( true );
  } );

  it( 'rejects invalid values and unknown attributes', () => {
    expect( attributesSchema.safeParse( { cache: '2h' } ).success ).toBe( false );
    expect( attributesSchema.safeParse( { unknown: 'x' } ).success ).toBe( false );
  } );
} );

describe( 'resolveMessageProviderOptions', () => {
  it( 'expands the cache attribute into anthropic cacheControl', () => {
    const result = resolveMessageProviderOptions( textPrompt( {
      messages: [
        { role: 'system', content: 'Static', attributes: { cache: true } },
        { role: 'user', content: 'Hello' }
      ]
    } ) );

    expect( result ).toEqual( [
      {
        role: 'system',
        content: 'Static',
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
      },
      { role: 'user', content: 'Hello' }
    ] );
  } );

  it( 'passes the 1h ttl through', () => {
    const [ system ] = resolveMessageProviderOptions( textPrompt( {
      messages: [ { role: 'system', content: 'Static', attributes: { cache: '1h' } } ]
    } ) );

    expect( system.providerOptions ).toEqual( {
      anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } }
    } );
  } );

  it( 'merges referenced messageOptions sets from the options attribute', () => {
    const [ system ] = resolveMessageProviderOptions( textPrompt( {
      config: { messageOptions: { cached: { anthropic: { cacheControl: { type: 'ephemeral' } } } } },
      messages: [ { role: 'system', content: 'Docs', attributes: { options: 'cached' } } ]
    } ) );

    expect( system.providerOptions ).toEqual( { anthropic: { cacheControl: { type: 'ephemeral' } } } );
  } );

  it( 'resolves the cache attribute for Claude models on vertex', () => {
    const [ system ] = resolveMessageProviderOptions( textPrompt( {
      config: { provider: 'vertex', model: 'claude-sonnet-4@vertex' },
      messages: [ { role: 'system', content: 'Static', attributes: { cache: true } } ]
    } ) );

    expect( system.providerOptions ).toEqual( { anthropic: { cacheControl: { type: 'ephemeral' } } } );
  } );

  it( 'warns and skips the cache attribute for non-anthropic providers', () => {
    const warnSpy = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
    const [ system ] = resolveMessageProviderOptions( textPrompt( {
      config: { provider: 'openai', model: 'gpt-4o' },
      messages: [ { role: 'system', content: 'Static', attributes: { cache: true } } ]
    } ) );

    expect( system ).toEqual( { role: 'system', content: 'Static' } );
    expect( warnSpy ).toHaveBeenCalledWith(
      expect.stringContaining( '"cache" shorthand only supports Anthropic models' )
    );
    warnSpy.mockRestore();
  } );

  it( 'throws when the options attribute references an unknown set', () => {
    expect( () => resolveMessageProviderOptions( textPrompt( {
      messages: [ { role: 'user', content: 'Hello', attributes: { options: 'missing' } } ]
    } ) ) ).toThrow( FatalError );
  } );

  it( 'leaves messages without attributes unchanged', () => {
    const messages = [ { role: 'user', content: 'Hello' } ];
    expect( resolveMessageProviderOptions( textPrompt( { messages } ) ) ).toEqual( messages );
  } );
} );
