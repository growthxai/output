import { describe, expect, it } from 'vitest';
import { Tracing } from '@outputai/core/sdk/runtime';
import { LLMGenerationUsage, LLMGenerationUsageItem, parseLLMUsage } from './usage.js';

const prompt = {
  config: {
    provider: 'test-provider',
    model: 'test-model'
  }
};

const parse = usage => parseLLMUsage( { prompt, usage } );
const step = webSearchQueries => ( { providerMetadata: { vertex: { groundingMetadata: { webSearchQueries } } } } );
const grounded = ( model, ...steps ) => parseLLMUsage( {
  prompt: { config: { provider: 'google-vertex', model } },
  usage: { inputTokens: 100, outputTokens: 50 },
  steps: steps.map( step )
} );
const serialize = value => JSON.parse( JSON.stringify( value ) );

describe( 'LLMGenerationUsage', () => {
  it( 'aggregates usage items and produces serializable data', () => {
    const usage = new LLMGenerationUsage( 'test-model', 'test-provider', [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, 'no_cache', 70 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, 'cache_read', 30 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, 'text', 40 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, 'reasoning', 10 )
    ] );

    expect( usage ).toBeInstanceOf( Tracing.Attribute.BaseAttribute );
    expect( serialize( usage ) ).toEqual( {
      type: LLMGenerationUsage.TYPE,
      providerId: 'test-provider',
      modelId: 'test-model',
      status: LLMGenerationUsage.Status.COMPLETE,
      input: 100,
      output: 50,
      total: 150,
      items: [
        { group: LLMGenerationUsageItem.Group.INPUT, label: 'no_cache', amount: 70 },
        { group: LLMGenerationUsageItem.Group.INPUT, label: 'cache_read', amount: 30 },
        { group: LLMGenerationUsageItem.Group.OUTPUT, label: 'text', amount: 40 },
        { group: LLMGenerationUsageItem.Group.OUTPUT, label: 'reasoning', amount: 10 }
      ]
    } );
  } );

  it( 'keeps missing groups null and marks usage incomplete', () => {
    const usage = new LLMGenerationUsage( 'test-model', 'test-provider', [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, null, 25 )
    ] );

    expect( usage ).toMatchObject( {
      status: LLMGenerationUsage.Status.INCOMPLETE,
      input: 25,
      output: null,
      total: 25
    } );
  } );

  it( 'represents empty items as incomplete usage without totals', () => {
    const usage = new LLMGenerationUsage( 'test-model', 'test-provider', [] );

    expect( usage ).toMatchObject( {
      status: LLMGenerationUsage.Status.INCOMPLETE,
      input: null,
      output: null,
      total: null,
      items: []
    } );
  } );
} );

describe( 'parseLLMUsage', () => {
  it( 'uses complete input and output breakdowns', () => {
    const result = parse( {
      inputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 70,
        cacheReadTokens: 20,
        cacheWriteTokens: 10
      },
      outputTokens: 50,
      outputTokenDetails: {
        textTokens: 40,
        reasoningTokens: 10
      }
    } );

    expect( serialize( result ) ).toEqual( {
      type: LLMGenerationUsage.TYPE,
      providerId: 'test-provider',
      modelId: 'test-model',
      status: LLMGenerationUsage.Status.COMPLETE,
      input: 100,
      output: 50,
      total: 150,
      items: [
        { group: LLMGenerationUsageItem.Group.INPUT, label: 'no_cache', amount: 70 },
        { group: LLMGenerationUsageItem.Group.INPUT, label: 'cache_read', amount: 20 },
        { group: LLMGenerationUsageItem.Group.INPUT, label: 'cache_write', amount: 10 },
        { group: LLMGenerationUsageItem.Group.OUTPUT, label: 'text', amount: 40 },
        { group: LLMGenerationUsageItem.Group.OUTPUT, label: 'reasoning', amount: 10 }
      ]
    } );
  } );

  it( 'uses sparse breakdowns when their reported values match the aggregates', () => {
    const result = parse( {
      inputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 80,
        cacheReadTokens: 20
      },
      outputTokens: 50,
      outputTokenDetails: {
        textTokens: 50
      }
    } );

    expect( result.items ).toEqual( [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, 'no_cache', 80 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, 'cache_read', 20 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, 'text', 50 )
    ] );
    expect( result.status ).toBe( LLMGenerationUsage.Status.COMPLETE );
  } );

  it( 'uses aggregate items when no breakdown is reported', () => {
    const result = parse( {
      inputTokens: 100,
      outputTokens: 50
    } );

    expect( result.items ).toEqual( [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, null, 100 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, null, 50 )
    ] );
    expect( result ).toMatchObject( {
      status: LLMGenerationUsage.Status.COMPLETE,
      input: 100,
      output: 50,
      total: 150
    } );
  } );

  it( 'uses aggregate items when reported breakdowns do not match', () => {
    const result = parse( {
      inputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 90,
        cacheReadTokens: 5,
        cacheWriteTokens: 0
      },
      outputTokens: 50,
      outputTokenDetails: {
        textTokens: 40,
        reasoningTokens: 5
      }
    } );

    expect( result.items ).toEqual( [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, null, 100 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, null, 50 )
    ] );
  } );

  it( 'preserves known zero aggregates', () => {
    const result = parse( {
      inputTokens: 0,
      inputTokenDetails: {
        noCacheTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0
      },
      outputTokens: 0,
      outputTokenDetails: {
        textTokens: 0,
        reasoningTokens: 0
      }
    } );

    expect( result ).toMatchObject( {
      status: LLMGenerationUsage.Status.COMPLETE,
      input: 0,
      output: 0,
      total: 0
    } );
    expect( result.items ).toEqual( [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, null, 0 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, null, 0 )
    ] );
  } );

  it.each( [
    {
      name: 'input',
      usage: { inputTokens: 25 },
      expected: { input: 25, output: null, total: 25 },
      item: new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, null, 25 )
    },
    {
      name: 'output',
      usage: { outputTokens: 15 },
      expected: { input: null, output: 15, total: 15 },
      item: new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, null, 15 )
    }
  ] )( 'marks $name-only usage incomplete', ( { usage, expected, item } ) => {
    const result = parse( usage );

    expect( result ).toMatchObject( {
      status: LLMGenerationUsage.Status.INCOMPLETE,
      ...expected
    } );
    expect( result.items ).toEqual( [ item ] );
  } );

  it.each( [
    Number.POSITIVE_INFINITY,
    -1,
    1.5
  ] )( 'ignores invalid aggregate value %s', inputTokens => {
    const result = parse( {
      inputTokens,
      outputTokens: 15
    } );

    expect( result ).toMatchObject( {
      status: LLMGenerationUsage.Status.INCOMPLETE,
      input: null,
      output: 15,
      total: 15
    } );
    expect( result.items ).toEqual( [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, null, 15 )
    ] );
  } );

  it( 'records a Gemini 3 grounded call as one request item per web search query', () => {
    const result = grounded( 'gemini-3.1-flash-lite', [ 'a', 'b', 'c' ] );

    expect( result.items ).toEqual( [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, null, 100 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, null, 50 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.REQUEST, 'grounding_query', 3 )
    ] );
  } );

  it( 'records a Gemini 2 grounded call as a single request item', () => {
    const result = grounded( 'gemini-2.5-flash', [ 'a', 'b', 'c' ] );

    expect( result.items.at( -1 ) ).toEqual(
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.REQUEST, 'grounding_prompt', 1 )
    );
  } );

  it( 'keeps grounding out of the token aggregates', () => {
    const result = grounded( 'gemini-3.1-flash-lite', [ 'a', 'b', 'c' ] );

    expect( result ).toMatchObject( {
      status: LLMGenerationUsage.Status.COMPLETE,
      input: 100,
      output: 50,
      total: 150
    } );
  } );

  it( 'sums Gemini 3 grounding queries across every step', () => {
    const result = grounded( 'gemini-3.1-flash-lite', [ 'a', 'b' ], [ 'c' ], [] );

    expect( result.items.at( -1 ) ).toEqual(
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.REQUEST, 'grounding_query', 3 )
    );
  } );

  it( 'charges Gemini 2 once per grounded step across a multi-step run', () => {
    const result = grounded( 'gemini-2.5-flash', [ 'a', 'b' ], [ 'c' ], [] );

    expect( result.items.at( -1 ) ).toEqual(
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.REQUEST, 'grounding_prompt', 2 )
    );
  } );

  it( 'reports grounding for a response without token usage', () => {
    const result = parseLLMUsage( {
      prompt,
      usage: {},
      steps: [ { providerMetadata: { vertex: { groundingMetadata: { webSearchQueries: [ 'a' ] } } } } ]
    } );

    expect( result ).toMatchObject( {
      status: LLMGenerationUsage.Status.INCOMPLETE,
      input: null,
      output: null,
      total: null
    } );
    expect( result.items ).toEqual( [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.REQUEST, 'grounding', 1 )
    ] );
  } );

  it( 'returns null when neither aggregate is reported', () => {
    const result = parse( {
      inputTokenDetails: {
        noCacheTokens: 10
      },
      outputTokenDetails: {
        textTokens: 5
      },
      totalTokens: 15
    } );

    expect( result ).toBeNull();
  } );
} );
