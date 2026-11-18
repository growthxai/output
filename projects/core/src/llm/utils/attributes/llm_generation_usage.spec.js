import { describe, expect, it } from 'vitest';
import { BaseAttribute } from '#trace_attribute';
import { LLMGenerationUsage, LLMGenerationUsageItem } from './llm_generation_usage.js';

const serialize = value => JSON.parse( JSON.stringify( value ) );

describe( 'LLMGenerationUsage', () => {
  it( 'aggregates usage items and produces serializable data', () => {
    const requestDetails = { ids: [ 'req-id' ], count: 1, duration: 10 };
    const usage = new LLMGenerationUsage( 'test-model', 'test-provider', 'writer@v1', requestDetails, [
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, 'no_cache', 70 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.INPUT, 'cache_read', 30 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, 'text', 40 ),
      new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.OUTPUT, 'reasoning', 10 )
    ] );

    expect( usage ).toBeInstanceOf( BaseAttribute );
    expect( serialize( usage ) ).toEqual( {
      type: LLMGenerationUsage.TYPE,
      providerId: 'test-provider',
      modelId: 'test-model',
      promptName: 'writer@v1',
      requestDetails,
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
    const usage = new LLMGenerationUsage( 'test-model', 'test-provider', null, null, [
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
    const usage = new LLMGenerationUsage( 'test-model', 'test-provider', null, null, [] );

    expect( usage ).toMatchObject( {
      status: LLMGenerationUsage.Status.INCOMPLETE,
      input: null,
      output: null,
      total: null,
      items: []
    } );
  } );
} );
