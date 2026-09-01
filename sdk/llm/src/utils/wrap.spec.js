import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import imageResponseFixture from '../fixtures/image_response_v7_openai.js';
import streamResponseFixture from '../fixtures/stream_response_v7_openai.js';
import textResponseFixture from '../fixtures/text_response_v7_openai.js';

const mocks = vi.hoisted( () => ( {
  extractSources: vi.fn(),
  parseLLMUsage: vi.fn(),
  calculateCosts: vi.fn(),
  convertCostToLegacy: vi.fn(),
  calculateBase64FileSize: vi.fn(),
  mapAiError: vi.fn(),
  randomBytes: vi.fn()
} ) );

vi.mock( './sources.js', () => ( {
  extractSources: mocks.extractSources
} ) );

vi.mock( './usage.js', () => ( {
  parseLLMUsage: mocks.parseLLMUsage
} ) );

vi.mock( './cost.js', () => ( {
  calculateCosts: mocks.calculateCosts
} ) );

vi.mock( './legacy_cost_attribute.js', () => ( {
  convertCostToLegacy: mocks.convertCostToLegacy
} ) );

vi.mock( './image.js', () => ( {
  calculateBase64FileSize: mocks.calculateBase64FileSize
} ) );

vi.mock( './error_handler.js', () => ( {
  mapAiError: mocks.mapAiError
} ) );

vi.mock( 'node:crypto', () => ( {
  randomBytes: mocks.randomBytes
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
const textResponse = () => clone( textResponseFixture );
const streamResponse = () => clone( streamResponseFixture );
const imageResponse = () => clone( imageResponseFixture );

const prompt = {
  name: 'writer@v1',
  config: { provider: 'openai', model: 'test-model' }
};

const mockUsage = {
  type: 'llm:generation:usage',
  providerId: 'openai',
  modelId: 'test-model',
  status: 'complete',
  input: 2,
  output: 1,
  total: 3,
  items: []
};
const mockCost = { type: 'llm:generation:cost', total: 0.001, items: [] };
const mockLegacyCost = { type: 'llm:usage', modelId: 'test-model', usage: [], total: 0.001, tokensUsed: 0 };
const mappedError = new Error( 'mapped' );

describe( 'wrapGeneration / wrapStream', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.spyOn( Date, 'now' ).mockReturnValue( 9_000_000_000 );
    mocks.extractSources.mockReturnValue( [] );
    mocks.parseLLMUsage.mockReturnValue( mockUsage );
    mocks.calculateCosts.mockResolvedValue( mockCost );
    mocks.convertCostToLegacy.mockReturnValue( mockLegacyCost );
    mocks.calculateBase64FileSize.mockReturnValue( 1234 );
    mocks.mapAiError.mockReturnValue( mappedError );
    mocks.randomBytes.mockReturnValue( Buffer.from( 'a1b2c3d4', 'hex' ) );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'wrapGeneration', () => {
    it( 'starts an llm trace, wraps a text response, and ends with raw usage and sources', async () => {
      const structuredCloneSpy = vi.spyOn( globalThis, 'structuredClone' );
      const response = textResponse();
      const mergedSources = [ { url: 'https://merged.test' } ];
      mocks.extractSources.mockReturnValue( mergedSources );

      const wrapped = await wrapGeneration( {
        name: 'generateText',
        prompt,
        fn: async () => response
      } );

      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        kind: 'llm',
        id: 'generateText-9000000000-a1b2c3d4',
        name: 'generateText',
        details: { prompt }
      } );
      expect( mocks.randomBytes ).toHaveBeenCalledWith( 4 );
      expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( {
        usage: response.usage,
        prompt
      } );
      expect( mocks.calculateCosts ).toHaveBeenCalledWith( mockUsage );
      expect( tracing.addEventAttribute ).toHaveBeenNthCalledWith( 1, {
        eventId: 'generateText-9000000000-a1b2c3d4',
        attribute: mockCost
      } );
      expect( tracing.addEventAttribute ).toHaveBeenNthCalledWith( 2, {
        eventId: 'generateText-9000000000-a1b2c3d4',
        attribute: mockLegacyCost
      } );
      expect( tracing.addEventAttribute ).toHaveBeenNthCalledWith( 3, {
        eventId: 'generateText-9000000000-a1b2c3d4',
        attribute: mockUsage
      } );
      expect( mocks.convertCostToLegacy ).toHaveBeenCalledWith( mockCost );
      expect( event.emit ).toHaveBeenNthCalledWith( 1, 'cost:llm:request', mockLegacyCost );
      expect( event.emit ).toHaveBeenNthCalledWith( 2, 'llm:generation:metering', {
        cost: mockCost,
        usage: mockUsage
      } );
      expect( structuredCloneSpy ).toHaveBeenCalledWith( mockLegacyCost );
      expect( structuredCloneSpy ).toHaveBeenCalledWith( { cost: mockCost, usage: mockUsage } );
      const legacyEventPayload = event.emit.mock.calls[0][1];
      const meteringEventPayload = event.emit.mock.calls[1][1];
      expect( legacyEventPayload ).not.toBe( mockLegacyCost );
      expect( meteringEventPayload.cost ).not.toBe( mockCost );
      expect( meteringEventPayload.usage ).not.toBe( mockUsage );
      expect( mocks.extractSources ).toHaveBeenCalledWith( response );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'generateText-9000000000-a1b2c3d4',
        details: {
          result: response.text,
          usage: response.usage,
          providerMetadata: response.finalStep.providerMetadata,
          sources: mergedSources
        }
      } );
      expect( wrapped.result ).toBe( response.text );
      expect( wrapped.cost ).toEqual( mockCost );
      expect( wrapped.sources ).toBe( mergedSources );
      expect( wrapped.text ).toBe( response.text );
    } );

    it( 'uses usage instead of deprecated totalUsage', async () => {
      const response = {
        text: 'hi',
        usage: { inputTokens: 2 },
        totalUsage: { inputTokens: 99 },
        finalStep: { providerMetadata: undefined },
        sources: []
      };

      await wrapGeneration( { name: 'generateText', prompt, fn: async () => response } );

      expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( {
        usage: { inputTokens: 2 },
        prompt
      } );
      expect( mocks.calculateCosts ).toHaveBeenCalledWith( mockUsage );
    } );

    it( 'wraps an image response using usage and mapped image metadata', async () => {
      const response = imageResponse();

      const wrapped = await wrapGeneration( {
        name: 'generateImage',
        prompt,
        fn: async () => response
      } );

      expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( {
        usage: response.usage,
        prompt
      } );
      expect( mocks.calculateCosts ).toHaveBeenCalledWith( mockUsage );
      expect( mocks.calculateBase64FileSize ).toHaveBeenCalledWith( response.images[0].base64Data );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'generateImage-9000000000-a1b2c3d4',
        details: {
          result: [ { size: 1234, mediaType: 'image/png' } ],
          usage: response.usage,
          providerMetadata: response.providerMetadata
        }
      } );
      expect( mocks.extractSources ).not.toHaveBeenCalled();
      expect( wrapped.result ).toBe( response.image );
      expect( wrapped.cost ).toEqual( mockCost );
    } );

    it( 'emits normalized usage when cost is missing', async () => {
      mocks.calculateCosts.mockResolvedValue( null );
      const response = textResponse();

      const wrapped = await wrapGeneration( {
        name: 'generateText',
        prompt,
        fn: async () => response
      } );

      expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
        eventId: 'generateText-9000000000-a1b2c3d4',
        attribute: mockUsage
      } );
      expect( event.emit ).toHaveBeenCalledOnce();
      expect( event.emit ).toHaveBeenCalledWith( 'llm:generation:metering', {
        cost: null,
        usage: mockUsage
      } );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'generateText-9000000000-a1b2c3d4',
        details: {
          result: response.text,
          usage: response.usage,
          providerMetadata: response.finalStep.providerMetadata,
          sources: []
        }
      } );
      expect( wrapped.cost ).toBeNull();
    } );

    it( 'skips the legacy attribute and event when the cost cannot be converted', async () => {
      mocks.convertCostToLegacy.mockReturnValue( null );
      const response = textResponse();

      await wrapGeneration( {
        name: 'generateText',
        prompt,
        fn: async () => response
      } );

      expect( tracing.addEventAttribute ).toHaveBeenNthCalledWith( 1, {
        eventId: 'generateText-9000000000-a1b2c3d4',
        attribute: mockCost
      } );
      expect( tracing.addEventAttribute ).toHaveBeenNthCalledWith( 2, {
        eventId: 'generateText-9000000000-a1b2c3d4',
        attribute: mockUsage
      } );
      expect( tracing.addEventAttribute ).toHaveBeenCalledTimes( 2 );
      expect( event.emit ).toHaveBeenCalledOnce();
      expect( event.emit ).toHaveBeenCalledWith( 'llm:generation:metering', {
        cost: mockCost,
        usage: mockUsage
      } );
    } );

    it( 'skips cost calculation when usage cannot be parsed', async () => {
      mocks.parseLLMUsage.mockReturnValue( null );
      const response = textResponse();

      const wrapped = await wrapGeneration( {
        name: 'generateText',
        prompt,
        fn: async () => response
      } );

      expect( mocks.calculateCosts ).not.toHaveBeenCalled();
      expect( tracing.addEventAttribute ).not.toHaveBeenCalled();
      expect( event.emit ).not.toHaveBeenCalled();
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'generateText-9000000000-a1b2c3d4',
        details: {
          result: response.text,
          usage: response.usage,
          providerMetadata: response.finalStep.providerMetadata,
          sources: []
        }
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
        id: 'Agent.generate-9000000000-a1b2c3d4',
        details: mappedError
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'wrapStream', () => {
    const hooksFrom = ( name, options = {} ) => {
      const fn = vi.fn( () => ( {} ) );
      wrapStream( { name, prompt, fn, ...options } );
      return fn.mock.calls[0][0];
    };

    it( 'starts an llm trace, returns fn result, and passes hooks', () => {
      const stream = { kind: 'stream' };
      const fn = vi.fn( () => stream );

      const result = wrapStream( { name: 'streamText', prompt, fn } );

      expect( result ).toBe( stream );
      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        kind: 'llm',
        id: 'streamText-9000000000-a1b2c3d4',
        name: 'streamText',
        details: { prompt }
      } );
      expect( fn ).toHaveBeenCalledWith( {
        onEndHook: expect.any( Function ),
        onErrorHook: expect.any( Function )
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );

    it( 'records an abort signal reason on the llm trace', () => {
      const abortController = new AbortController();
      const abortReason = new DOMException( 'Cancelled by caller', 'AbortError' );

      wrapStream( {
        name: 'streamText',
        prompt,
        abortSignal: abortController.signal,
        fn: () => ( {} )
      } );
      abortController.abort( abortReason );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( abortReason );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: mappedError
      } );
    } );

    it( 'records an already-aborted signal before creating the stream', () => {
      const abortController = new AbortController();
      const abortReason = new DOMException( 'Already cancelled', 'AbortError' );
      abortController.abort( abortReason );

      wrapStream( {
        name: 'streamText',
        prompt,
        abortSignal: abortController.signal,
        fn: () => ( {} )
      } );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( abortReason );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: mappedError
      } );
    } );

    it( 'wraps onEnd, ends the trace, then awaits the callback', async () => {
      const response = streamResponse();
      const mergedSources = [ { url: 'https://s.test' } ];
      mocks.extractSources.mockReturnValue( mergedSources );
      const callback = vi.fn();
      const { onEndHook } = hooksFrom( 'Agent.stream' );

      await onEndHook( response, callback );

      expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( {
        usage: response.usage,
        prompt
      } );
      expect( mocks.calculateCosts ).toHaveBeenCalledWith( mockUsage );
      expect( mocks.extractSources ).toHaveBeenCalledWith( response );
      expect( callback ).toHaveBeenCalledOnce();
      const proxied = callback.mock.calls[0][0];
      expect( proxied.result ).toBe( response.text );
      expect( proxied.cost ).toEqual( mockCost );
      expect( proxied.sources ).toBe( mergedSources );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'Agent.stream-9000000000-a1b2c3d4',
        details: {
          result: response.text,
          usage: response.usage,
          providerMetadata: response.finalStep.providerMetadata,
          sources: mergedSources
        }
      } );
      expect( tracing.addEventEnd.mock.invocationCallOrder[0] ).toBeLessThan( callback.mock.invocationCallOrder[0] );
    } );

    it( 'removes the abort listener when the stream ends', async () => {
      const abortController = new AbortController();
      const { onEndHook } = hooksFrom( 'streamText', { abortSignal: abortController.signal } );

      await onEndHook( streamResponse() );
      abortController.abort( new DOMException( 'Too late', 'AbortError' ) );

      expect( tracing.addEventEnd ).toHaveBeenCalledOnce();
      expect( tracing.addEventError ).not.toHaveBeenCalled();
    } );

    it( 'ends the trace and swallows throws from the onEnd callback', async () => {
      const response = textResponse();
      const { onEndHook } = hooksFrom( 'Agent.stream' );

      await expect( onEndHook( response, async () => {
        throw new Error( 'user onEnd' );
      } ) ).resolves.toBeUndefined();

      expect( tracing.addEventEnd ).toHaveBeenCalledOnce();
      expect( tracing.addEventError ).not.toHaveBeenCalled();
      expect( mocks.mapAiError ).not.toHaveBeenCalled();
    } );

    it( 'maps onError events and forwards the mapped error to the callback', () => {
      const original = new Error( 'stream failed' );
      const callback = vi.fn();
      const { onErrorHook } = hooksFrom( 'streamText' );

      onErrorHook( { error: original }, callback );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: mappedError
      } );
      expect( callback ).toHaveBeenCalledWith( mappedError );
    } );

    it( 'removes the abort listener when the stream reports an error', async () => {
      const abortController = new AbortController();
      const { onErrorHook } = hooksFrom( 'streamText', { abortSignal: abortController.signal } );

      await onErrorHook( { error: new Error( 'stream failed' ) } );
      abortController.abort( new DOMException( 'Too late', 'AbortError' ) );

      expect( tracing.addEventError ).toHaveBeenCalledOnce();
      expect( mocks.mapAiError ).toHaveBeenCalledOnce();
    } );

    it( 'swallows throws from the onError callback', async () => {
      const { onErrorHook } = hooksFrom( 'streamText' );

      await expect( onErrorHook( { error: new Error( 'x' ) }, () => {
        throw new Error( 'user onError' );
      } ) ).resolves.toBeUndefined();
    } );

    it( 'awaits and swallows rejected promises from the onError callback', async () => {
      const state = { rejection: null };
      const callback = vi.fn( () => new Promise( ( _, reject ) => {
        state.rejection = reject;
      } ) );
      const { onErrorHook } = hooksFrom( 'streamText' );

      const hookPromise = onErrorHook( { error: new Error( 'x' ) }, callback );

      expect( hookPromise ).toBeInstanceOf( Promise );
      state.rejection( new Error( 'async user onError' ) );
      await expect( hookPromise ).resolves.toBeUndefined();
    } );

    it( 'maps a throw from fn onto the llm trace and rethrows', () => {
      const original = new Error( 'create stream' );
      const abortController = new AbortController();
      const removeEventListener = vi.spyOn( abortController.signal, 'removeEventListener' );

      expect( () => wrapStream( {
        name: 'streamText',
        prompt,
        abortSignal: abortController.signal,
        fn: () => {
          throw original;
        }
      } ) ).toThrow( mappedError );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: mappedError
      } );
      expect( removeEventListener ).toHaveBeenCalledOnce();
    } );

    it( 'maps a rejected promise from fn onto the llm trace and rethrows', async () => {
      const original = new Error( 'prepareCall failed' );
      const abortController = new AbortController();
      const removeEventListener = vi.spyOn( abortController.signal, 'removeEventListener' );

      await expect( wrapStream( {
        name: 'Agent.stream',
        prompt,
        abortSignal: abortController.signal,
        fn: () => Promise.reject( original )
      } ) ).rejects.toBe( mappedError );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'Agent.stream-9000000000-a1b2c3d4',
        details: mappedError
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
      expect( removeEventListener ).toHaveBeenCalledOnce();
    } );

    it( 'returns a fulfilled promise from fn without mapping', async () => {
      const stream = { kind: 'stream' };

      await expect( wrapStream( {
        name: 'Agent.stream',
        prompt,
        fn: () => Promise.resolve( stream )
      } ) ).resolves.toBe( stream );

      expect( mocks.mapAiError ).not.toHaveBeenCalled();
      expect( tracing.addEventError ).not.toHaveBeenCalled();
    } );
  } );
} );
