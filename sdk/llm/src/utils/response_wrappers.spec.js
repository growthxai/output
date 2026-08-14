import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImage } from 'ai';
import { MockImageModelV3 } from 'ai/test';
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

import { wrapTextResponse, wrapStreamResult, wrapImageResponse } from './response_wrappers.js';

const clone = value => structuredClone( value );

const makeAiSdkImageResponse = () => generateImage( {
  model: new MockImageModelV3( {
    doGenerate: async () => ( {
      images: imageResponseFixture.images.map( image => Buffer.from( image.base64Data, 'base64' ) ),
      warnings: imageResponseFixture.warnings,
      response: {
        ...imageResponseFixture.responses[0],
        timestamp: new Date( imageResponseFixture.responses[0].timestamp )
      },
      providerMetadata: imageResponseFixture.providerMetadata,
      usage: imageResponseFixture.usage
    } )
  } ),
  prompt: 'fixture prompt'
} );

describe( 'wrapTextResponse', () => {
  const traceId = 'trace-1';
  const providerId = 'openai';
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

    const wrapped = await wrapTextResponse( { traceId, providerId, modelId, response } );

    expect( wrapped.result ).toBe( response.text );
    expect( wrapped.cost ).toEqual( mockCost );
    expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
      usage: response.totalUsage,
      modelId,
      providerId
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

    const wrapped = await wrapTextResponse( { traceId, providerId, modelId, response } );

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

    const wrapped = await wrapTextResponse( { traceId, providerId, modelId, response } );

    expect( wrapped.sources ).toBe( mergedSources );
    expect( mocks.combineSources ).toHaveBeenCalledWith( {
      sourcesFromTools: [ toolSource ],
      sourcesFromResponse: [ responseSource ]
    } );
  } );
} );

describe( 'wrapStreamResult', () => {
  const captured = new Error( 'provider 400' );

  const iterable = ( chunks = [], throwOnEnd ) => ( {
    async *[Symbol.asyncIterator]() {
      for ( const chunk of chunks ) {
        yield chunk;
      }
      if ( throwOnEnd ) {
        throw throwOnEnd;
      }
    }
  } );

  const collect = async stream => {
    const chunks = [];
    for await ( const chunk of stream ) {
      chunks.push( chunk );
    }
    return chunks;
  };

  it( 'throws the captured error when textStream ends empty', async () => {
    const wrapped = wrapStreamResult(
      { textStream: iterable() },
      { error: captured }
    );

    await expect( collect( wrapped.textStream ) ).rejects.toBe( captured );
  } );

  it( 'throws the captured error after textStream yields chunks', async () => {
    const wrapped = wrapStreamResult(
      { textStream: iterable( [ 'a', 'b' ] ) },
      { error: captured }
    );

    await expect( collect( wrapped.textStream ) ).rejects.toBe( captured );
  } );

  it( 'returns chunks when textStream ends without a captured error', async () => {
    const wrapped = wrapStreamResult(
      { textStream: iterable( [ 'a', 'b' ] ) },
      { error: null }
    );

    await expect( collect( wrapped.textStream ) ).resolves.toEqual( [ 'a', 'b' ] );
  } );

  it( 'prefers the captured error when textStream throws', async () => {
    const streamError = new Error( 'No output generated' );
    const wrapped = wrapStreamResult(
      { textStream: iterable( [], streamError ) },
      { error: captured }
    );

    await expect( collect( wrapped.textStream ) ).rejects.toBe( captured );
  } );

  it( 'rethrows the stream error when nothing was captured', async () => {
    const streamError = new Error( 'socket closed' );
    const wrapped = wrapStreamResult(
      { textStream: iterable( [], streamError ) },
      { error: null }
    );

    await expect( collect( wrapped.textStream ) ).rejects.toBe( streamError );
  } );

  it( 'throws the captured error when a result promise resolves', async () => {
    const wrapped = wrapStreamResult(
      { text: Promise.resolve( 'partial' ) },
      { error: captured }
    );

    await expect( wrapped.text ).rejects.toBe( captured );
  } );

  it( 'prefers the captured error when a result promise rejects', async () => {
    const wrapped = wrapStreamResult(
      { text: Promise.reject( new Error( 'No output generated' ) ) },
      { error: captured }
    );

    await expect( wrapped.text ).rejects.toBe( captured );
  } );

  it( 'returns the resolved value when nothing was captured', async () => {
    const wrapped = wrapStreamResult(
      { text: Promise.resolve( 'hello' ) },
      { error: null }
    );

    await expect( wrapped.text ).resolves.toBe( 'hello' );
  } );

  it( 'binds methods to the original result', () => {
    const result = {
      ok: 1,
      consumeStream() {
        return this.ok;
      }
    };
    const wrapped = wrapStreamResult( result, { error: null } );

    expect( wrapped.consumeStream() ).toBe( 1 );
  } );

  it( 'leaves fullStream unwrapped', async () => {
    const fullStream = iterable( [ { type: 'error', error: captured } ] );
    const wrapped = wrapStreamResult( { fullStream }, { error: captured } );

    expect( wrapped.fullStream ).toBe( fullStream );
  } );
} );

describe( 'wrapImageResponse', () => {
  const traceId = 'image-trace';
  const providerId = 'openai';
  const modelId = 'image-model';
  const mockCost = { total: 0.003, components: [] };

  beforeEach( () => {
    vi.clearAllMocks();
    mocks.calculateLLMCallCost.mockResolvedValue( mockCost );
    mocks.calculateBase64FileSize.mockReturnValue( 1234 );
  } );

  it( 'uses an image response fixture to trace image metadata and attach cost', async () => {
    const response = await makeAiSdkImageResponse();

    const wrapped = await wrapImageResponse( { traceId, providerId, modelId, response } );

    expect( wrapped.result ).toBe( response.images[0] );
    expect( wrapped.cost ).toEqual( mockCost );
    expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
      usage: response.usage,
      modelId,
      providerId
    } );
    expect( mocks.calculateBase64FileSize ).toHaveBeenCalledWith( response.images[0].base64 );
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
