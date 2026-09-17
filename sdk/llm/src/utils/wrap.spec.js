import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import imageResponseFixture from '../fixtures/image_response_v7_openai.js';
import streamResponseFixture from '../fixtures/stream_response_v7_openai.js';
import textResponseFixture from '../fixtures/text_response_v7_openai.js';

const mocks = vi.hoisted( () => ( {
  extractSources: vi.fn(),
  serializeImagesFromResponse: vi.fn(),
  mapAiError: vi.fn(),
  randomBytes: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn() },
  /** Stands in for the framework error, which is never retried */
  FatalError: class FatalError extends Error {},
  meterings: [],
  billedCost: null
} ) );

vi.mock( '@outputai/core', () => ( {
  Logger: mocks.logger,
  FatalError: mocks.FatalError
} ) );

vi.mock( './sources.js', () => ( {
  extractSources: mocks.extractSources
} ) );

vi.mock( './image.js', () => ( {
  serializeImagesFromResponse: mocks.serializeImagesFromResponse
} ) );

vi.mock( './error_handler.js', () => ( {
  mapAiError: mocks.mapAiError
} ) );

vi.mock( 'node:crypto', () => ( {
  randomBytes: mocks.randomBytes
} ) );

/** Stands in for the real collector: records what the wrapper feeds it and exposes the billed cost */
vi.mock( './metering.js', () => ( {
  Metering: class {
    constructor( { traceId, prompt } ) {
      this.traceId = traceId;
      this.prompt = prompt;
      this.attributes = { usage: null, cost: null, legacy: null };
      this.recordStep = vi.fn();
      this.bill = vi.fn( async () => {
        this.attributes.cost = mocks.billedCost;
      } );
      mocks.meterings.push( this );
    }
  }
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

import { Tracing } from '@outputai/core/sdk/runtime';
import { wrapImageGeneration, wrapStream, wrapTextGeneration } from './wrap.js';

const tracing = vi.mocked( Tracing, true );

const clone = value => structuredClone( value );
const textResponse = () => clone( textResponseFixture );
const streamResponse = () => clone( streamResponseFixture );
const imageResponse = () => clone( imageResponseFixture );

/** Collector built by the wrapper under test */
const metering = () => mocks.meterings.at( -1 );

const prompt = {
  name: 'writer@v1',
  config: { provider: 'openai', model: 'test-model' }
};

const mockCost = { type: 'llm:generation:cost', total: 0.001, items: [] };
const mappedError = new Error( 'mapped' );
const serializedImages = [ { size: 1234, mediaType: 'image/png' } ];

describe( 'wrapTextGeneration / wrapImageGeneration / wrapStream', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.spyOn( Date, 'now' ).mockReturnValue( 9_000_000_000 );
    mocks.meterings.length = 0;
    mocks.billedCost = mockCost;
    mocks.extractSources.mockReturnValue( [] );
    mocks.serializeImagesFromResponse.mockReturnValue( serializedImages );
    mocks.mapAiError.mockReturnValue( mappedError );
    mocks.randomBytes.mockReturnValue( Buffer.from( 'a1b2c3d4', 'hex' ) );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  /** Completes the way the sdk does: the response the wrapper bills is the one `fn` returns */
  const meteredFn = response => async () => response;

  describe( 'wrapTextGeneration', () => {
    it( 'starts an llm trace, bills, and ends with raw usage and sources', async () => {
      const response = textResponse();
      const mergedSources = [ { url: 'https://merged.test' } ];
      mocks.extractSources.mockReturnValue( mergedSources );

      const wrapped = await wrapTextGeneration( {
        name: 'generateText',
        prompt,
        fn: meteredFn( response )
      } );

      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        kind: 'llm',
        id: 'generateText-9000000000-a1b2c3d4',
        name: 'generateText',
        details: { prompt }
      } );
      expect( mocks.randomBytes ).toHaveBeenCalledWith( 4 );
      expect( metering().bill ).toHaveBeenCalledExactlyOnceWith( response );
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
      expect( wrapped.cost ).toBe( mockCost );
      expect( wrapped.sources ).toBe( mergedSources );
      expect( wrapped.text ).toBe( response.text );
    } );

    it( 'builds the collector for the trace it started', async () => {
      await wrapTextGeneration( { name: 'generateText', prompt, fn: meteredFn( textResponse() ) } );

      expect( metering().traceId ).toBe( 'generateText-9000000000-a1b2c3d4' );
      expect( metering().prompt ).toBe( prompt );
    } );

    it( 'wires the step hook to the collector', async () => {
      const fn = vi.fn( async () => textResponse() );

      await wrapTextGeneration( { name: 'generateText', prompt, fn } );

      expect( fn ).toHaveBeenCalledWith( { onStepEndHook: metering().recordStep } );
    } );

    it( 'bills before ending the trace', async () => {
      await wrapTextGeneration( { name: 'generateText', prompt, fn: meteredFn( textResponse() ) } );

      expect( metering().bill.mock.invocationCallOrder[0] )
        .toBeLessThan( tracing.addEventEnd.mock.invocationCallOrder[0] );
    } );

    it( 'uses usage instead of deprecated totalUsage', async () => {
      const response = {
        text: 'hi',
        usage: { inputTokens: 2 },
        totalUsage: { inputTokens: 99 },
        finalStep: { providerMetadata: undefined },
        steps: [ { providerMetadata: undefined } ],
        sources: []
      };

      await wrapTextGeneration( { name: 'generateText', prompt, fn: meteredFn( response ) } );

      expect( tracing.addEventEnd.mock.calls[0][0].details.usage ).toBe( response.usage );
    } );

    it( 'proxies a null cost when there was nothing to bill', async () => {
      mocks.billedCost = null;
      const response = textResponse();

      const wrapped = await wrapTextGeneration( { name: 'generateText', prompt, fn: async () => response } );

      expect( metering().bill ).toHaveBeenCalledExactlyOnceWith( response );
      expect( wrapped.cost ).toBeNull();
      expect( wrapped.result ).toBe( response.text );
    } );

    it( 'bills the recorded steps when the call fails after the model ran', async () => {
      const original = new Error( 'no output generated' );
      const step = { usage: { inputTokens: 2, outputTokens: 1 }, providerMetadata: { openai: {} } };

      await expect( wrapTextGeneration( {
        name: 'generateText',
        prompt,
        fn: async ( { onStepEndHook } ) => {
          onStepEndHook( step );
          throw original;
        }
      } ) ).rejects.toBe( mappedError );

      expect( metering().recordStep ).toHaveBeenCalledWith( step );
      // no response to bill, so the collector falls back to the step it recorded
      expect( metering().bill ).toHaveBeenCalledExactlyOnceWith( null );
      expect( metering().bill.mock.invocationCallOrder[0] )
        .toBeLessThan( tracing.addEventError.mock.invocationCallOrder[0] );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );

    it( 'wraps a response handling failure in a fatal error after billing', async () => {
      const error = await wrapTextGeneration( { name: 'generateText', prompt, fn: async () => null } ).catch( e => e );

      expect( error ).toBeInstanceOf( mocks.FatalError );
      expect( error.message ).toBe( 'AI SDK response handling failed.' );
      expect( error.cause ).toBeInstanceOf( TypeError );
      expect( metering().bill ).toHaveBeenCalledOnce();
      expect( mocks.mapAiError ).not.toHaveBeenCalled();
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'generateText-9000000000-a1b2c3d4',
        details: error
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );

    it( 'maps fn errors onto the llm trace and rethrows', async () => {
      const original = new Error( 'boom' );

      await expect( wrapTextGeneration( {
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

  describe( 'wrapImageGeneration', () => {
    it( 'bills the returned response and wraps the first image', async () => {
      const response = imageResponse();

      const wrapped = await wrapImageGeneration( {
        name: 'generateImage',
        prompt,
        fn: async () => response
      } );

      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        kind: 'llm',
        id: 'generateImage-9000000000-a1b2c3d4',
        name: 'generateImage',
        details: { prompt }
      } );
      expect( metering().traceId ).toBe( 'generateImage-9000000000-a1b2c3d4' );
      expect( metering().bill ).toHaveBeenCalledExactlyOnceWith( response );
      expect( mocks.serializeImagesFromResponse ).toHaveBeenCalledWith( response );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'generateImage-9000000000-a1b2c3d4',
        details: {
          result: serializedImages,
          usage: response.usage,
          providerMetadata: response.providerMetadata
        }
      } );
      expect( mocks.extractSources ).not.toHaveBeenCalled();
      expect( wrapped.result ).toBe( response.image );
      expect( wrapped.cost ).toBe( mockCost );
    } );

    it( 'bills before wrapping a response handling failure in a fatal error', async () => {
      const error = await wrapImageGeneration( { name: 'generateImage', prompt, fn: async () => null } ).catch( e => e );

      expect( error ).toBeInstanceOf( mocks.FatalError );
      expect( error.cause ).toBeInstanceOf( TypeError );
      expect( metering().bill ).toHaveBeenCalledExactlyOnceWith( null );
      expect( mocks.serializeImagesFromResponse ).not.toHaveBeenCalled();
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'generateImage-9000000000-a1b2c3d4',
        details: error
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );

    it( 'maps fn errors onto the llm trace and rethrows without billing', async () => {
      const original = new Error( 'image boom' );

      await expect( wrapImageGeneration( {
        name: 'generateImage',
        prompt,
        fn: async () => {
          throw original;
        }
      } ) ).rejects.toBe( mappedError );

      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'generateImage-9000000000-a1b2c3d4',
        details: mappedError
      } );
      expect( metering().bill ).not.toHaveBeenCalled();
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
        onErrorHook: expect.any( Function ),
        onStepEndHook: metering().recordStep,
        onAbortHook: expect.any( Function )
      } );
      expect( metering().traceId ).toBe( 'streamText-9000000000-a1b2c3d4' );
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

    it( 'wraps a non-error abort reason before recording it', () => {
      const abortController = new AbortController();

      wrapStream( {
        name: 'streamText',
        prompt,
        abortSignal: abortController.signal,
        fn: () => ( {} )
      } );
      abortController.abort( 'user navigated away' );

      const [ recorded ] = mocks.mapAiError.mock.calls[0];
      expect( recorded ).toBeInstanceOf( Error );
      expect( recorded.message ).toBe( 'Streaming aborted.' );
      expect( recorded.cause ).toBe( 'user navigated away' );
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

    it( 'bills what the collector holds when the sdk aborts the stream', async () => {
      const abortController = new AbortController();
      const { onAbortHook } = hooksFrom( 'streamText', { abortSignal: abortController.signal } );
      abortController.abort( new DOMException( 'Cancelled by caller', 'AbortError' ) );

      await onAbortHook();

      expect( metering().bill ).toHaveBeenCalledOnce();
      // the signal listener already recorded the abort, so the hook must not add a second error
      expect( tracing.addEventError ).toHaveBeenCalledOnce();
    } );

    it( 'records a timeout abort that never reached the signal', async () => {
      const abortController = new AbortController();
      const { onAbortHook } = hooksFrom( 'streamText', { abortSignal: abortController.signal } );

      await onAbortHook();

      const [ recorded ] = mocks.mapAiError.mock.calls[0];
      expect( recorded.message ).toBe( 'Streaming timed out.' );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: mappedError
      } );
      expect( metering().bill.mock.invocationCallOrder[0] )
        .toBeLessThan( tracing.addEventError.mock.invocationCallOrder[0] );
    } );

    it( 'records a timeout abort when the call carries no signal', async () => {
      const { onAbortHook } = hooksFrom( 'streamText' );

      await onAbortHook();

      expect( metering().bill ).toHaveBeenCalledOnce();
      expect( tracing.addEventError ).toHaveBeenCalledOnce();
    } );

    it( 'bills onEnd, ends the trace, then awaits the callback', async () => {
      const response = streamResponse();
      const mergedSources = [ { url: 'https://s.test' } ];
      mocks.extractSources.mockReturnValue( mergedSources );
      const callback = vi.fn();
      const { onEndHook } = hooksFrom( 'Agent.stream' );

      await onEndHook( response, callback );

      expect( metering().bill ).toHaveBeenCalledExactlyOnceWith( response );
      expect( mocks.extractSources ).toHaveBeenCalledWith( response );
      expect( callback ).toHaveBeenCalledOnce();
      const proxied = callback.mock.calls[0][0];
      expect( proxied.result ).toBe( response.text );
      expect( proxied.cost ).toBe( mockCost );
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

      const callback = vi.fn( async () => {
        throw new Error( 'user onEnd' );
      } );

      await onEndHook( response, callback );

      expect( callback.mock.calls[0][0].result ).toBe( response.text );
      expect( tracing.addEventEnd ).toHaveBeenCalledOnce();
      expect( tracing.addEventError ).not.toHaveBeenCalled();
      expect( mocks.mapAiError ).not.toHaveBeenCalled();
      expect( mocks.logger.error ).toHaveBeenCalledWith( 'Stream onEnd() callback failed', {
        namespace: 'LLM',
        error: 'user onEnd'
      } );
    } );

    it( 'records a response handling failure on the trace without ending it', async () => {
      const callback = vi.fn();
      const { onEndHook } = hooksFrom( 'streamText' );

      await expect( onEndHook( null, callback ) ).resolves.toBeUndefined();

      expect( metering().bill ).toHaveBeenCalledOnce();
      expect( callback ).not.toHaveBeenCalled();
      expect( mocks.logger.error ).toHaveBeenCalledWith( 'AI SDK response handling failed', {
        namespace: 'LLM',
        error: expect.any( String )
      } );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: expect.any( mocks.FatalError )
      } );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
    } );

    it( 'skips a callback that is not a function', async () => {
      const response = streamResponse();
      const { onEndHook } = hooksFrom( 'streamText' );

      await expect( onEndHook( response, 'not-a-function' ) ).resolves.toBeUndefined();

      expect( tracing.addEventEnd ).toHaveBeenCalledOnce();
      expect( mocks.logger.error ).not.toHaveBeenCalled();
    } );

    it( 'bills onError, maps the event error, and forwards it to the callback', async () => {
      const original = new Error( 'stream failed' );
      const callback = vi.fn();
      const { onErrorHook } = hooksFrom( 'streamText' );

      await onErrorHook( { error: original }, callback );

      expect( metering().bill ).toHaveBeenCalledOnce();
      expect( metering().bill.mock.invocationCallOrder[0] )
        .toBeLessThan( tracing.addEventError.mock.invocationCallOrder[0] );
      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: mappedError
      } );
      expect( callback ).toHaveBeenCalledWith( mappedError );
    } );

    it( 'normalizes an error event that carries no error instance', async () => {
      const callback = vi.fn();
      const { onErrorHook } = hooksFrom( 'streamText' );

      await onErrorHook( { error: { code: 500 } }, callback );

      const [ recorded ] = mocks.mapAiError.mock.calls[0];
      expect( recorded ).toBeInstanceOf( Error );
      expect( recorded.message ).toBe( 'Streaming failed.' );
      expect( recorded.cause ).toEqual( { code: 500 } );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: mappedError
      } );
      expect( callback ).toHaveBeenCalledWith( mappedError );
    } );

    it( 'bills on every terminal hook and leaves deduplication to the collector', async () => {
      const response = streamResponse();
      const { onEndHook, onErrorHook, onStepEndHook } = hooksFrom( 'streamText' );

      // The sdk reports the error before the steps that preceded it, so onEnd is the one with usage
      await onErrorHook( { error: new Error( 'provider chunk failed' ) }, vi.fn() );
      await onStepEndHook( response.steps[0] );
      await onEndHook( response );

      expect( metering().recordStep ).toHaveBeenCalledWith( response.steps[0] );
      expect( metering().bill.mock.calls ).toEqual( [ [], [ response ] ] );
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

      expect( mocks.logger.error ).toHaveBeenCalledWith( 'Stream onError() callback failed', {
        namespace: 'LLM',
        error: 'user onError'
      } );
    } );

    it( 'awaits and swallows rejected promises from the onError callback', async () => {
      const state = { rejection: null };
      const callback = vi.fn( () => new Promise( ( _, reject ) => {
        state.rejection = reject;
      } ) );
      const { onErrorHook } = hooksFrom( 'streamText' );

      const hookPromise = onErrorHook( { error: new Error( 'x' ) }, callback );
      await Promise.resolve();

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

    it( 'records a rejected output promise on the llm trace', async () => {
      const original = new Error( 'output did not match schema' );
      const stream = { output: Promise.reject( original ) };

      const result = wrapStream( { name: 'streamText', prompt, fn: () => stream } );
      await expect( stream.output ).rejects.toBe( original );

      expect( result ).toBe( stream );
      expect( mocks.mapAiError ).toHaveBeenCalledWith( original );
      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'streamText-9000000000-a1b2c3d4',
        details: mappedError
      } );
    } );

    it( 'records a rejected output promise of a stream fn resolved to', async () => {
      const original = new Error( 'output did not match schema' );
      const stream = { output: Promise.reject( original ) };

      await wrapStream( { name: 'Agent.stream', prompt, fn: () => Promise.resolve( stream ) } );
      await expect( stream.output ).rejects.toBe( original );

      expect( tracing.addEventError ).toHaveBeenCalledWith( {
        id: 'Agent.stream-9000000000-a1b2c3d4',
        details: mappedError
      } );
    } );

    it( 'leaves the trace untouched when the output resolves', async () => {
      const stream = { output: Promise.resolve( { answer: 'ok' } ) };

      wrapStream( { name: 'streamText', prompt, fn: () => stream } );
      await stream.output;

      expect( mocks.mapAiError ).not.toHaveBeenCalled();
      expect( tracing.addEventError ).not.toHaveBeenCalled();
    } );
  } );
} );
