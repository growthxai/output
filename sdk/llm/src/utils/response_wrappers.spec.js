import { describe, it, expect, vi, beforeEach } from 'vitest';
import textResponseFixture from './__fixtures__/text_response.json' with { type: 'json' };
import streamResponseFixture from './__fixtures__/stream_response.json' with { type: 'json' };
import imageResponseFixture from './__fixtures__/image_response.json' with { type: 'json' };

const mocks = vi.hoisted( () => ( {
  combineSources: vi.fn(),
  extractSourcesFromSteps: vi.fn(),
  calculateLLMCallCost: vi.fn(),
  endTraceWithSuccess: vi.fn(),
  calculateBase64FileSize: vi.fn()
} ) );

vi.mock( './source_extraction.js', () => ( {
  combineSources: mocks.combineSources,
  extractSourcesFromSteps: mocks.extractSourcesFromSteps
} ) );

vi.mock( '../cost/index.js', () => ( {
  calculateLLMCallCost: mocks.calculateLLMCallCost
} ) );

vi.mock( './trace.js', () => ( {
  endTraceWithSuccess: mocks.endTraceWithSuccess
} ) );

vi.mock( './image.js', () => ( {
  calculateBase64FileSize: mocks.calculateBase64FileSize
} ) );

import { wrapTextResponse, wrapStreamOnFinishResponse, wrapImageResponse } from './response_wrappers.js';

const clone = value => structuredClone( value );

describe( 'wrapTextResponse', () => {
  const traceId = 'trace-1';
  const modelId = 'test-model';
  const mockCost = { total: 0.001, components: [ { name: 'input_tokens', value: 0.001 } ] };

  beforeEach( () => {
    vi.clearAllMocks();
    mocks.extractSourcesFromSteps.mockReturnValue( [] );
    mocks.calculateLLMCallCost.mockResolvedValue( mockCost );
    mocks.combineSources.mockReturnValue( [] );
  } );

  it( 'uses a text response fixture to calculate cost, end trace, and attach cost', async () => {
    const response = clone( textResponseFixture );

    const wrapped = await wrapTextResponse( { traceId, modelId, response } );

    expect( wrapped.result ).toBe( response.text );
    expect( wrapped.cost ).toEqual( mockCost );
    expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
      usage: response.totalUsage,
      modelId
    } );
    expect( mocks.extractSourcesFromSteps ).toHaveBeenCalledWith( response.steps );
    expect( mocks.endTraceWithSuccess ).toHaveBeenCalledWith( {
      traceId,
      usage: response.totalUsage,
      cost: mockCost,
      result: response.text,
      providerMetadata: response.providerMetadata,
      sourcesFromTools: []
    } );
  } );

  it( 'leaves sources unchanged when no tool-extracted sources are found', async () => {
    const response = clone( streamResponseFixture );
    const nativeSources = [
      { type: 'source', sourceType: 'url', id: 'n1', url: 'https://native.test', title: 'Native' }
    ];
    response.sources = nativeSources;
    mocks.extractSourcesFromSteps.mockReturnValue( [] );

    const wrapped = await wrapTextResponse( { traceId, modelId, response } );

    expect( wrapped.sources ).toBe( nativeSources );
    expect( mocks.combineSources ).not.toHaveBeenCalled();
  } );

  it( 'delegates source merging when tool-extracted sources exist', async () => {
    const response = clone( streamResponseFixture );
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
    const mergedSources = [ toolSource, responseSource ];
    response.sources = [ responseSource ];
    mocks.extractSourcesFromSteps.mockReturnValue( [ toolSource ] );
    mocks.combineSources.mockReturnValue( mergedSources );

    const wrapped = await wrapTextResponse( { traceId, modelId, response } );

    expect( wrapped.sources ).toBe( mergedSources );
    expect( mocks.combineSources ).toHaveBeenCalledWith( {
      sourcesFromTools: [ toolSource ],
      sourcesFromResponse: [ responseSource ]
    } );
  } );
} );

describe( 'wrapStreamOnFinishResponse', () => {
  const traceId = 'stream-trace';
  const modelId = 'stream-model';
  const mockCost = { total: 0.002, components: [] };

  beforeEach( () => {
    vi.clearAllMocks();
    mocks.calculateLLMCallCost.mockResolvedValue( mockCost );
    mocks.extractSourcesFromSteps.mockReturnValue( [] );
  } );

  it( 'uses the stream response fixture to finish trace and call the user callback with a proxied response', async () => {
    const userOnFinish = vi.fn();
    const response = clone( streamResponseFixture );

    const callbacks = wrapStreamOnFinishResponse( {
      traceId,
      modelId,
      onFinish: userOnFinish
    } );

    await callbacks.onFinish( response );

    expect( mocks.endTraceWithSuccess ).toHaveBeenCalledWith( {
      traceId,
      usage: response.totalUsage,
      cost: mockCost,
      result: response.text,
      providerMetadata: response.providerMetadata,
      sourcesFromTools: []
    } );
    expect( userOnFinish ).toHaveBeenCalledTimes( 1 );
    const proxied = userOnFinish.mock.calls[0][0];
    expect( proxied.result ).toBe( response.text );
    expect( proxied.cost ).toEqual( mockCost );
    expect( proxied.finishReason ).toBe( response.finishReason );
    expect( mocks.extractSourcesFromSteps ).toHaveBeenCalledWith( response.steps );
  } );

  it( 'finishes trace even when no user onFinish callback is provided', async () => {
    const response = clone( streamResponseFixture );

    const callbacks = wrapStreamOnFinishResponse( {
      traceId,
      modelId
    } );

    await callbacks.onFinish( response );

    expect( mocks.endTraceWithSuccess ).toHaveBeenCalledWith( {
      traceId,
      usage: response.totalUsage,
      cost: mockCost,
      result: response.text,
      providerMetadata: response.providerMetadata,
      sourcesFromTools: []
    } );
    expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
      usage: response.totalUsage,
      modelId
    } );
  } );
} );

describe( 'wrapImageResponse', () => {
  const traceId = 'image-trace';
  const modelId = 'image-model';
  const mockCost = { total: 0.003, components: [] };

  beforeEach( () => {
    vi.clearAllMocks();
    mocks.calculateLLMCallCost.mockResolvedValue( mockCost );
    mocks.calculateBase64FileSize.mockReturnValue( 1234 );
  } );

  it( 'uses an image response fixture to trace image metadata and attach cost', async () => {
    const response = clone( imageResponseFixture );

    const wrapped = await wrapImageResponse( { traceId, modelId, response } );

    expect( wrapped.result ).toBe( response.images[0] );
    expect( wrapped.cost ).toEqual( mockCost );
    expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
      usage: response.usage,
      modelId
    } );
    expect( mocks.calculateBase64FileSize ).toHaveBeenCalledWith( response.images[0].base64Data );
    expect( mocks.endTraceWithSuccess ).toHaveBeenCalledWith( {
      traceId,
      usage: response.usage,
      cost: mockCost,
      result: [
        {
          size: 1234,
          mediaType: response.images[0].mediaType
        }
      ],
      providerMetadata: response.providerMetadata
    } );
  } );
} );
