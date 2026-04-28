import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted( () => ( {
  extractSourcesFromSteps: vi.fn(),
  calculateLLMCallCost: vi.fn(),
  endTraceWithSuccess: vi.fn(),
  endTraceWithError: vi.fn()
} ) );

vi.mock( './source_extraction.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    extractSourcesFromSteps: mocks.extractSourcesFromSteps
  };
} );

vi.mock( '../cost/index.js', () => ( {
  calculateLLMCallCost: mocks.calculateLLMCallCost
} ) );

vi.mock( './trace.js', () => ( {
  endTraceWithSuccess: mocks.endTraceWithSuccess,
  endTraceWithError: mocks.endTraceWithError
} ) );

import { wrapTextResponse, wrapStreamResponse } from './response_wrappers.js';

describe( 'wrapTextResponse', () => {
  const traceId = 'trace-1';
  const modelId = 'test-model';
  const mockCost = { total: 0.001, components: [ { name: 'input_tokens', value: 0.001 } ] };

  beforeEach( () => {
    vi.clearAllMocks();
    mocks.extractSourcesFromSteps.mockReturnValue( [] );
    mocks.calculateLLMCallCost.mockResolvedValue( mockCost );
  } );

  it( 'proxies result to text and attaches cost', async () => {
    const response = {
      text: 'hello',
      totalUsage: { inputTokens: 10, outputTokens: 5 },
      steps: [],
      sources: []
    };

    const wrapped = await wrapTextResponse( { traceId, modelId, response } );

    expect( wrapped.result ).toBe( 'hello' );
    expect( wrapped.text ).toBe( 'hello' );
    expect( wrapped.cost ).toEqual( mockCost );
    expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
      usage: response.totalUsage,
      modelId
    } );
    expect( mocks.endTraceWithSuccess ).toHaveBeenCalledWith( {
      traceId,
      modelId,
      response,
      cost: mockCost,
      sourcesFromTools: []
    } );
  } );

  it( 'leaves sources unchanged when no tool-extracted sources (same as raw response)', async () => {
    const nativeSources = [
      { type: 'source', sourceType: 'url', id: 'n1', url: 'https://native.test', title: 'Native' }
    ];
    mocks.extractSourcesFromSteps.mockReturnValue( [] );

    const response = {
      text: 'x',
      totalUsage: {},
      steps: [],
      sources: nativeSources
    };

    const wrapped = await wrapTextResponse( { traceId, modelId, response } );

    expect( wrapped.sources ).toBe( nativeSources );
  } );

  it( 'merges tool-extracted sources with response sources by url when tool sources exist', async () => {
    const toolSource = {
      type: 'source',
      sourceType: 'url',
      id: 'id-a',
      url: 'https://example.com/a',
      title: 'A'
    };
    const responseSource = {
      type: 'source',
      sourceType: 'url',
      id: 'id-b',
      url: 'https://example.com/b',
      title: 'B'
    };
    mocks.extractSourcesFromSteps.mockReturnValue( [ toolSource ] );

    const response = {
      text: 'x',
      totalUsage: {},
      steps: [ {} ],
      sources: [ responseSource ]
    };

    const wrapped = await wrapTextResponse( { traceId, modelId, response } );

    expect( wrapped.sources ).toEqual( expect.arrayContaining( [ toolSource, responseSource ] ) );
    expect( wrapped.sources ).toHaveLength( 2 );
  } );

  it( 'when tool sources overlap urls, later entry in merge wins', async () => {
    const url = 'https://example.com/same';
    mocks.extractSourcesFromSteps.mockReturnValue( [
      { type: 'source', sourceType: 'url', id: '1', url, title: 'from-tool' }
    ] );

    const response = {
      text: 'x',
      totalUsage: {},
      steps: [],
      sources: [
        { type: 'source', sourceType: 'url', id: '2', url, title: 'from-response' }
      ]
    };

    const wrapped = await wrapTextResponse( { traceId, modelId, response } );

    expect( wrapped.sources ).toHaveLength( 1 );
    expect( wrapped.sources[0].title ).toBe( 'from-response' );
  } );
} );

describe( 'wrapStreamResponse', () => {
  const traceId = 'stream-trace';
  const modelId = 'stream-model';
  const mockCost = { total: 0.002, components: [] };

  beforeEach( () => {
    vi.clearAllMocks();
    mocks.calculateLLMCallCost.mockResolvedValue( mockCost );
  } );

  it( 'onFinish finishes trace, proxies cost for user callback, and forwards other props', async () => {
    const userOnFinish = vi.fn();
    const response = {
      text: 'done',
      totalUsage: { inputTokens: 1 },
      finishReason: 'stop'
    };

    const callbacks = wrapStreamResponse( {
      traceId,
      modelId,
      onFinish: userOnFinish,
      onError: undefined
    } );

    await callbacks.onFinish( response );

    expect( mocks.endTraceWithSuccess ).toHaveBeenCalledWith( {
      traceId,
      modelId,
      response,
      cost: mockCost
    } );
    expect( userOnFinish ).toHaveBeenCalledTimes( 1 );
    const proxied = userOnFinish.mock.calls[0][0];
    expect( proxied.cost ).toEqual( mockCost );
    expect( proxied.finishReason ).toBe( 'stop' );
  } );

  it( 'onError records trace error and invokes user onError', () => {
    const userOnError = vi.fn();
    const err = new Error( 'stream failed' );

    const callbacks = wrapStreamResponse( {
      traceId,
      modelId,
      onFinish: undefined,
      onError: userOnError
    } );

    callbacks.onError( { error: err } );

    expect( mocks.endTraceWithError ).toHaveBeenCalledWith( { traceId, error: err } );
    expect( userOnError ).toHaveBeenCalledWith( { error: err } );
  } );
} );
