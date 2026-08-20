import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import streamResponseFixture from './__fixtures__/stream_response.json' with { type: 'json' };

const mocks = vi.hoisted( () => ( {
  extractSources: vi.fn(),
  calculateLLMCallCost: vi.fn(),
  calculateBase64FileSize: vi.fn(),
  mapAiError: vi.fn()
} ) );

vi.mock( './sources.js', () => ( {
  extractSources: mocks.extractSources
} ) );

vi.mock( '../cost/index.js', () => ( {
  calculateLLMCallCost: mocks.calculateLLMCallCost
} ) );

vi.mock( './image.js', () => ( {
  calculateBase64FileSize: mocks.calculateBase64FileSize
} ) );

vi.mock( './error_handler.js', () => ( {
  mapAiError: mocks.mapAiError
} ) );

vi.mock( '@outputai/core/sdk/runtime', () => ( {
  Tracing: {
    addEventStart: vi.fn(),
    addEventError: vi.fn(),
    addEventAttribute: vi.fn(),
    addEventEnd: vi.fn()
  },
  Event: {
    emit: vi.fn()
  }
} ) );

import { Tracing, Event } from '@outputai/core/sdk/runtime';
import { wrapGeneration, wrapStream } from './wrap.js';

const tracing = vi.mocked( Tracing, true );
const event = vi.mocked( Event, true );

const clone = value => structuredClone( value );

const prompt = {
  name: 'writer@v1',
  config: { provider: 'openai', model: 'test-model' }
};

const mockCost = { total: 0.001, components: [] };
const mappedError = new Error( 'mapped' );

describe( 'wrapGeneration / wrapStream', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.spyOn( Date, 'now' ).mockReturnValue( 9_000_000_000 );
    mocks.extractSources.mockReturnValue( [] );
    mocks.calculateLLMCallCost.mockResolvedValue( mockCost );
    mocks.calculateBase64FileSize.mockReturnValue( 1234 );
    mocks.mapAiError.mockReturnValue( mappedError );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'wrapGeneration', () => {
    it( 'starts an llm trace, wraps a text response, and ends with cost and sources', async () => {
      const response = clone( streamResponseFixture );
      const mergedSources = [ { url: 'https://merged.test' } ];
      mocks.extractSources.mockReturnValue( mergedSources );

      const wrapped = await wrapGeneration( {
        name: 'generateText',
        prompt,
        fn: async () => response
      } );

      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        kind: 'llm',
        id: 'generateText-9000000000',
        name: 'generateText',
        details: { prompt }
      } );
      expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
        usage: response.totalUsage,
        modelId: 'test-model',
        providerId: 'openai'
      } );
      expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
        eventId: 'generateText-9000000000',
        attribute: mockCost
      } );
      expect( event.emit ).toHaveBeenCalledWith( 'cost:llm:request', mockCost );
      expect( mocks.extractSources ).toHaveBeenCalledWith( response );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'generateText-9000000000',
        details: {
          result: response.text,
          usage: response.totalUsage,
          cost: mockCost,
          providerMetadata: response.providerMetadata,
          sources: mergedSources
        }
      } );
      expect( wrapped.result ).toBe( response.text );
      expect( wrapped.cost ).toEqual( mockCost );
      expect( wrapped.sources ).toBe( mergedSources );
      expect( wrapped.text ).toBe( response.text );
    } );

    it( 'prefers totalUsage over usage when both are present', async () => {
      const response = {
        text: 'hi',
        totalUsage: { inputTokens: 2 },
        usage: { inputTokens: 99 },
        steps: [],
        sources: []
      };

      await wrapGeneration( { name: 'generateText', prompt, fn: async () => response } );

      expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
        usage: { inputTokens: 2 },
        modelId: 'test-model',
        providerId: 'openai'
      } );
    } );

    it( 'wraps an image response using usage and mapped image metadata', async () => {
      const image = { mediaType: 'image/png', base64: 'abc' };
      const response = {
        image,
        images: [ image ],
        usage: { inputTokens: 8, outputTokens: 16 },
        providerMetadata: { openai: {} }
      };

      const wrapped = await wrapGeneration( {
        name: 'generateImage',
        prompt,
        fn: async () => response
      } );

      expect( mocks.calculateLLMCallCost ).toHaveBeenCalledWith( {
        usage: response.usage,
        modelId: 'test-model',
        providerId: 'openai'
      } );
      expect( mocks.calculateBase64FileSize ).toHaveBeenCalledWith( 'abc' );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'generateImage-9000000000',
        details: {
          result: [ { size: 1234, mediaType: 'image/png' } ],
          usage: response.usage,
          cost: mockCost,
          providerMetadata: response.providerMetadata
        }
      } );
      expect( mocks.extractSources ).not.toHaveBeenCalled();
      expect( wrapped.result ).toBe( image );
      expect( wrapped.cost ).toEqual( mockCost );
    } );

    it( 'skips cost attribute and event when cost is missing', async () => {
      mocks.calculateLLMCallCost.mockResolvedValue( null );
      const response = clone( streamResponseFixture );

      const wrapped = await wrapGeneration( {
        name: 'generateText',
        prompt,
        fn: async () => response
      } );

      expect( tracing.addEventAttribute ).not.toHaveBeenCalled();
      expect( event.emit ).not.toHaveBeenCalled();
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'generateText-9000000000',
        details: expect.objectContaining( { cost: null, result: response.text } )
      } );
      expect( wrapped.cost ).toBeNull();
    } );

    it( 'maps fn errors onto the llm trace and rethrows', async () => {
      const original = new Error( 'boom' );

      await expect( wrapGeneration( {
        name: 'Agent.generate',
        prompt,
        fn: async () => {
          throw original;
        }
      } ) ).rejects.toBe( mappedError );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'Agent.generate-9000000000',
        details: mappedError
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'wrapStream', () => {
    const hooksFrom = name => {
      const fn = vi.fn( () => ( {} ) );
      wrapStream( { name, prompt, fn } );
      return fn.mock.calls[0][0];
    };

    it( 'starts an llm trace, returns fn result, and passes hooks', () => {
      const stream = { kind: 'stream' };
      const fn = vi.fn( () => stream );

      const result = wrapStream( { name: 'streamText', prompt, fn } );

      expect( result ).toBe( stream );
      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        kind: 'llm',
        id: 'streamText-9000000000',
        name: 'streamText',
        details: { prompt }
      } );
      expect( fn ).toHaveBeenCalledWith( {
        onFinishHook: expect.any( Function ),
        onErrorHook: expect.any( Function )
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );

    it( 'wraps onFinish, awaits the callback, then ends the trace', async () => {
      const response = clone( streamResponseFixture );
      const mergedSources = [ { url: 'https://s.test' } ];
      mocks.extractSources.mockReturnValue( mergedSources );
      const callback = vi.fn();
      const { onFinishHook } = hooksFrom( 'Agent.stream' );

      await onFinishHook( response, callback );

      expect( mocks.extractSources ).toHaveBeenCalledWith( response );
      expect( callback ).toHaveBeenCalledOnce();
      const proxied = callback.mock.calls[0][0];
      expect( proxied.result ).toBe( response.text );
      expect( proxied.cost ).toEqual( mockCost );
      expect( proxied.sources ).toBe( mergedSources );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'Agent.stream-9000000000',
        details: {
          result: response.text,
          usage: response.totalUsage,
          cost: mockCost,
          providerMetadata: response.providerMetadata,
          sources: mergedSources
        }
      } );
    } );

    it( 'records an error and skips addEventEnd when the onFinish callback throws', async () => {
      const response = clone( streamResponseFixture );
      const storeError = new Error( 'store failed' );
      mocks.mapAiError.mockReturnValue( mappedError );
      const { onFinishHook } = hooksFrom( 'Agent.stream' );

      await expect( onFinishHook( response, async () => {
        throw storeError;
      } ) ).rejects.toBe( mappedError );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( storeError );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'Agent.stream-9000000000',
        details: mappedError
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );

    it( 'maps onError events and forwards the mapped error to the callback', () => {
      const original = new Error( 'stream failed' );
      const callback = vi.fn();
      const { onErrorHook } = hooksFrom( 'streamText' );

      onErrorHook( { error: original }, callback );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000',
        details: mappedError
      } );
      expect( callback ).toHaveBeenCalledWith( mappedError );
    } );

    it( 'swallows throws from the onError callback', () => {
      const { onErrorHook } = hooksFrom( 'streamText' );

      expect( () => onErrorHook( { error: new Error( 'x' ) }, () => {
        throw new Error( 'user onError' );
      } ) ).not.toThrow();
    } );

    it( 'maps a throw from fn onto the llm trace and rethrows', () => {
      const original = new Error( 'create stream' );

      expect( () => wrapStream( {
        name: 'streamText',
        prompt,
        fn: () => {
          throw original;
        }
      } ) ).toThrow( mappedError );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000',
        details: mappedError
      } );
    } );
  } );
} );
