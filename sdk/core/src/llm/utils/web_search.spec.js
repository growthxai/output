import { describe, expect, it } from 'vitest';
import googleVertexText from '../fixtures/text_response_v7_google_vertex.js';
import { parseWebSearchUsage, resolveWebSearchPpm } from './web_search.js';

const metadata = ( key, webSearchQueries ) => ( {
  [key]: { groundingMetadata: { webSearchQueries } }
} );

describe( 'resolveWebSearchPpm', () => {
  it( 'prices Anthropic and OpenAI searches per million requests', () => {
    expect( resolveWebSearchPpm( 'anthropic', 'web_search' ) ).toBe( 10_000 );
    expect( resolveWebSearchPpm( 'openai', 'web_search' ) ).toBe( 10_000 );
  } );

  it( 'prices preview search by OpenAI model type', () => {
    expect( resolveWebSearchPpm( 'openai', 'web_search_preview', { cost: {}, reasoning: true } ) ).toBe( 10_000 );
    expect( resolveWebSearchPpm( 'openai', 'web_search_preview', { cost: {}, reasoning: false } ) ).toBe( 25_000 );
    expect( resolveWebSearchPpm( 'openai', 'web_search_preview' ) ).toBeNull();
  } );

  it( 'prices Google grounding units per million', () => {
    expect( resolveWebSearchPpm( 'google-vertex', 'grounding_query' ) ).toBe( 14_000 );
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

    expect( parseWebSearchUsage( 'anthropic', 'claude-haiku-4-5', step ) ).toEqual( [ {
      label: 'web_search',
      amount: 3
    } ] );
  } );

  it( 'counts one query per Google web search on Gemini 3', () => {
    const step = { providerMetadata: metadata( 'vertex', [ 'a', 'b', 'c' ] ) };

    expect( parseWebSearchUsage( 'google-vertex', 'gemini-3.1-flash-lite', step ) ).toEqual( [ {
      label: 'grounding_query',
      amount: 3
    } ] );
  } );

  it( 'counts one query per Google web search on Gemini 4', () => {
    const step = { providerMetadata: metadata( 'vertex', [ 'a', 'b', 'c' ] ) };

    expect( parseWebSearchUsage( 'google-vertex', 'gemini-4-pro', step ) ).toEqual( [ {
      label: 'grounding_query',
      amount: 3
    } ] );
  } );

  it( 'reads the Google provider metadata key', () => {
    const step = { providerMetadata: metadata( 'google', [ 'a' ] ) };

    expect( parseWebSearchUsage( 'google-vertex', 'gemini-3-pro', step ) ).toEqual( [ {
      label: 'grounding_query',
      amount: 1
    } ] );
  } );

  it( 'records unpriced Google search usage for an unknown model family', () => {
    const step = { providerMetadata: metadata( 'vertex', [ 'a', 'b' ] ) };

    expect( parseWebSearchUsage( 'google-vertex', 'unknown-model', step ) ).toEqual( [ {
      label: 'grounding',
      amount: 2
    } ] );
  } );

  it( 'reads Google grounding from a Vertex response fixture', () => {
    expect( parseWebSearchUsage( 'google-vertex', 'gemini-2.5-flash', googleVertexText.finalStep ) ).toEqual( [ {
      label: 'grounding',
      amount: 2
    } ] );
  } );

  it.each( [
    { name: 'no provider metadata', providerMetadata: undefined },
    { name: 'a non-Google provider', providerMetadata: { anthropic: {} } },
    { name: 'null grounding metadata', providerMetadata: { vertex: { groundingMetadata: null } } },
    { name: 'no web search queries', providerMetadata: { vertex: { groundingMetadata: {} } } },
    { name: 'an empty query list', providerMetadata: metadata( 'vertex', [] ) }
  ] )( 'returns no Google web search usage for $name', ( { providerMetadata } ) => {
    expect( parseWebSearchUsage( 'google-vertex', 'gemini-3-pro', { providerMetadata } ) ).toEqual( [] );
  } );

  it( 'counts only mapped OpenAI provider-executed search calls', () => {
    const step = {
      content: [
        { type: 'tool-call', toolName: 'research', providerExecuted: true },
        { type: 'tool-result', toolName: 'research', output: { action: { type: 'search' } } },
        { type: 'tool-result', toolName: 'image', output: { action: { type: 'search' } } },
        { type: 'tool-call', toolName: 'research', providerExecuted: false }
      ]
    };
    const toolIdsByName = {
      research: 'openai.web_search',
      image: 'openai.image_generation'
    };

    expect( parseWebSearchUsage( 'openai', 'gpt-4.1-mini', step, toolIdsByName ) ).toEqual( [ {
      label: 'web_search',
      amount: 1
    } ] );
  } );

  it( 'counts only OpenAI search actions', () => {
    const step = {
      content: [
        { type: 'tool-result', toolName: 'standard', output: { action: { type: 'search' } } },
        { type: 'tool-result', toolName: 'standard', output: { action: { type: 'openPage' } } },
        { type: 'tool-result', toolName: 'standard', output: { action: { type: 'findInPage' } } }
      ]
    };

    expect( parseWebSearchUsage( 'openai', 'gpt-4.1-mini', step, {
      standard: 'openai.web_search'
    } ) ).toEqual( [
      { label: 'web_search', amount: 1 }
    ] );
  } );

  it( 'counts preview OpenAI search actions', () => {
    const step = {
      content: [
        { type: 'tool-result', toolName: 'preview', output: { action: { type: 'search' } } }
      ]
    };

    expect( parseWebSearchUsage( 'openai', 'gpt-4.1-mini', step, {
      preview: 'openai.web_search_preview'
    } ) ).toEqual( [
      { label: 'web_search_preview', amount: 1 }
    ] );
  } );

  it( 'marks OpenAI usage ambiguous when both search variants are configured', () => {
    const step = {
      content: [
        { type: 'tool-result', toolName: 'standard', output: { action: { type: 'search' } } },
        { type: 'tool-result', toolName: 'standard', output: { action: { type: 'search' } } }
      ]
    };

    expect( parseWebSearchUsage( 'openai', 'gpt-4.1-mini', step, {
      standard: 'openai.web_search',
      preview: 'openai.web_search_preview'
    } ) ).toEqual( [
      { label: 'web_search_unknown', amount: 2 }
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
      },
      toolIdsByName: {
        research: 'openai.image_generation'
      }
    },
    {
      name: 'missing OpenAI content',
      providerId: 'openai',
      step: {},
      toolIdsByName: {
        research: 'openai.web_search'
      }
    },
    {
      name: 'another provider',
      providerId: 'perplexity',
      step: {
        content: [
          { type: 'tool-call', toolName: 'research', providerExecuted: true }
        ]
      }
    }
  ] )( 'returns no usage for $name', ( { providerId, step, toolIdsByName } ) => {
    expect( parseWebSearchUsage( providerId, 'test-model', step, toolIdsByName ) ).toEqual( [] );
  } );
} );
