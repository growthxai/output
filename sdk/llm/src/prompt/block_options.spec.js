import { describe, it, expect } from 'vitest';
import { FatalError } from '@outputai/core';
import { attributesSchema, resolveMessageProviderOptions } from './block_options.js';

const textPrompt = ( { config = {}, messages } ) => ( {
  name: 'test@v1',
  config: { provider: 'anthropic', model: 'claude-sonnet-4-5', ...config },
  messages
} );

describe( 'attributesSchema', () => {
  it( 'accepts the options attribute', () => {
    expect( attributesSchema.safeParse( { options: 'cached' } ).success ).toBe( true );
    expect( attributesSchema.safeParse( { options: 'cached fast' } ).success ).toBe( true );
    expect( attributesSchema.safeParse( {} ).success ).toBe( true );
  } );

  it( 'rejects unknown attributes, including the removed cache shorthand', () => {
    expect( attributesSchema.safeParse( { cache: true } ).success ).toBe( false );
    expect( attributesSchema.safeParse( { unknown: 'x' } ).success ).toBe( false );
  } );
} );

describe( 'resolveMessageProviderOptions', () => {
  it( 'merges a referenced messageOptions set into per-message providerOptions', () => {
    const result = resolveMessageProviderOptions( textPrompt( {
      config: { messageOptions: { cached: { anthropic: { cacheControl: { type: 'ephemeral' } } } } },
      messages: [
        { role: 'system', content: 'Docs', attributes: { options: 'cached' } },
        { role: 'user', content: 'Hello' }
      ]
    } ) );

    expect( result ).toEqual( [
      {
        role: 'system',
        content: 'Docs',
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
      },
      { role: 'user', content: 'Hello' }
    ] );
  } );

  it( 'merges multiple referenced sets onto one block', () => {
    const [ system ] = resolveMessageProviderOptions( textPrompt( {
      config: {
        messageOptions: {
          cached: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
          openaiKey: { openai: { promptCacheKey: 'enrich-v1' } }
        }
      },
      messages: [ { role: 'system', content: 'Docs', attributes: { options: 'cached openaiKey' } } ]
    } ) );

    expect( system.providerOptions ).toEqual( {
      anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
      openai: { promptCacheKey: 'enrich-v1' }
    } );
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
