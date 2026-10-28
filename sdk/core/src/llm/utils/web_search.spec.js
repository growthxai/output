import { describe, expect, it } from 'vitest';
import { parseWebSearchUsage, resolveWebSearchPpm, WebSearchPpmMap } from './web_search.js';

describe( 'WebSearchPpmMap', () => {
  it( 'prices Anthropic and OpenAI searches per million requests', () => {
    expect( WebSearchPpmMap ).toEqual( new Map( [
      [ 'anthropic/web_search', 10_000 ],
      [ 'openai/web_search', 10_000 ]
    ] ) );
  } );

  it( 'prices preview search by OpenAI model type', () => {
    expect( resolveWebSearchPpm( 'openai', 'web_search_preview', { cost: {}, reasoning: true } ) ).toBe( 10_000 );
    expect( resolveWebSearchPpm( 'openai', 'web_search_preview', { cost: {}, reasoning: false } ) ).toBe( 25_000 );
    expect( resolveWebSearchPpm( 'openai', 'web_search_preview' ) ).toBeNull();
  } );
} );

describe( 'parseWebSearchUsage', () => {
  it( 'reads Anthropic search requests from provider usage', () => {
    const step = {
      providerMetadata: {
        anthropic: {
          usage: {
            server_tool_use: {
              web_search_requests: 3
            }
          }
        }
      }
    };

    expect( parseWebSearchUsage( 'anthropic', step ) ).toEqual( [ {
      label: 'web_search',
      amount: 3
    } ] );
  } );

  it( 'counts only mapped OpenAI provider-executed search calls', () => {
    const step = {
      content: [
        { type: 'tool-call', toolName: 'research', providerExecuted: true },
        { type: 'tool-result', toolName: 'research' },
        { type: 'tool-call', toolName: 'image', providerExecuted: true },
        { type: 'tool-call', toolName: 'research', providerExecuted: false }
      ]
    };
    const toolIdsByName = {
      research: 'openai.web_search',
      image: 'openai.image_generation'
    };

    expect( parseWebSearchUsage( 'openai', step, toolIdsByName ) ).toEqual( [ {
      label: 'web_search',
      amount: 1
    } ] );
  } );

  it( 'counts standard and preview OpenAI searches separately', () => {
    const step = {
      content: [
        { type: 'tool-call', toolName: 'standard', providerExecuted: true },
        { type: 'tool-call', toolName: 'preview', providerExecuted: true },
        { type: 'tool-call', toolName: 'preview', providerExecuted: true }
      ]
    };

    expect( parseWebSearchUsage( 'openai', step, {
      standard: 'openai.web_search',
      preview: 'openai.web_search_preview'
    } ) ).toEqual( [
      { label: 'web_search', amount: 1 },
      { label: 'web_search_preview', amount: 2 }
    ] );
  } );

  it.each( [
    {
      name: 'zero Anthropic requests',
      providerId: 'anthropic',
      step: {
        providerMetadata: {
          anthropic: {
            usage: {
              server_tool_use: {
                web_search_requests: 0
              }
            }
          }
        }
      }
    },
    {
      name: 'an unmapped OpenAI call',
      providerId: 'openai',
      step: {
        content: [
          { type: 'tool-call', toolName: 'research', providerExecuted: true }
        ]
      }
    },
    {
      name: 'another provider',
      providerId: 'google-vertex',
      step: {
        content: [
          { type: 'tool-call', toolName: 'research', providerExecuted: true }
        ]
      }
    }
  ] )( 'returns null for $name', ( { providerId, step } ) => {
    expect( parseWebSearchUsage( providerId, step ) ).toEqual( [] );
  } );
} );
