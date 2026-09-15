import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateText, streamText, stepCountIs, tool } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from '@outputai/core';
import { Tracing, Event } from '@outputai/core/sdk/runtime';
import { wrapStream, wrapTextGeneration } from './wrap.js';

const mocks = vi.hoisted( () => ( {
  calculateCosts: vi.fn(),
  convertCostToLegacy: vi.fn()
} ) );

vi.mock( './cost.js', () => ( {
  calculateCosts: mocks.calculateCosts
} ) );

vi.mock( './legacy_cost_attribute.js', () => ( {
  convertCostToLegacy: mocks.convertCostToLegacy
} ) );

const prompt = {
  name: 'writer@v1',
  config: { provider: 'openai', model: 'gpt-test' }
};

const mockCost = { type: 'llm:generation:cost', total: 0.001, items: [] };

/** Usage shape the language model protocol reports; the sdk flattens it before we see it */
const modelUsage = {
  inputTokens: { total: 10, noCache: 10 },
  outputTokens: { total: 5 },
  totalTokens: { total: 15 }
};

const textChunks = [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: '1' },
  { type: 'text-delta', id: '1', delta: 'hello' },
  { type: 'text-end', id: '1' }
];

/** Finishes a step with a tool call, so the loop reports usage and then runs the tool */
const toolCallChunks = [
  { type: 'stream-start', warnings: [] },
  { type: 'tool-input-start', id: 'call-1', toolName: 'stop' },
  { type: 'tool-input-delta', id: 'call-1', delta: '{}' },
  { type: 'tool-input-end', id: 'call-1' },
  { type: 'tool-call', toolCallId: 'call-1', toolName: 'stop', input: '{}' },
  { type: 'finish', finishReason: 'tool-calls', usage: modelUsage }
];

const generatingModel = () => new MockLanguageModelV4( {
  doGenerate: async () => ( {
    content: [ { type: 'text', text: 'hello' } ],
    finishReason: 'stop',
    usage: modelUsage,
    warnings: []
  } )
} );

const streamingModel = chunks => new MockLanguageModelV4( {
  doStream: async () => ( { stream: simulateReadableStream( { chunks } ) } )
} );

/** Normalized usage carried by the metering event, or undefined when nothing was billed */
const billedUsage = () => Event.emit.mock.calls.find( ( [ name ] ) => name === 'llm:generation:metering' )?.[1].usage;

/** Reads the stream to the end the way a consumer does; error parts arrive through the sdk `onError` */
const consume = stream => stream.consumeStream();

/**
 * Exercises the wrappers against the real ai sdk with a mock model, so a change in which lifecycle
 * events the sdk emits - or in what they carry - fails here instead of going unnoticed by the unit
 * specs, which mock the sdk away.
 */
describe( 'wrap against the real ai sdk', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mocks.calculateCosts.mockResolvedValue( mockCost );
    mocks.convertCostToLegacy.mockReturnValue( null );
    vi.spyOn( Tracing, 'addEventStart' ).mockImplementation( () => {} );
    vi.spyOn( Tracing, 'addEventEnd' ).mockImplementation( () => {} );
    vi.spyOn( Tracing, 'addEventError' ).mockImplementation( () => {} );
    vi.spyOn( Tracing, 'addEventAttribute' ).mockImplementation( () => {} );
    vi.spyOn( Event, 'emit' ).mockImplementation( () => {} );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'bills a completed generation from the telemetry events', async () => {
    const wrapped = await wrapTextGeneration( {
      name: 'generateText',
      prompt,
      fn: wiringOptions => generateText( { model: generatingModel(), prompt: 'hi', ...wiringOptions } )
    } );

    expect( billedUsage() ).toMatchObject( { input: 10, output: 5, total: 15, status: 'complete' } );
    expect( wrapped.cost ).toBe( mockCost );
  } );

  it( 'bills a generation that throws after the model ran', async () => {
    await expect( wrapTextGeneration( {
      name: 'generateText',
      prompt,
      fn: async wiringOptions => {
        await generateText( { model: generatingModel(), prompt: 'hi', ...wiringOptions } );
        throw new Error( 'output validation failed' );
      }
    } ) ).rejects.toThrow();

    expect( billedUsage() ).toMatchObject( { input: 10, output: 5, total: 15 } );
  } );

  it( 'bills a stream that reports an error before the usage it already spent', async () => {
    const chunks = [
      ...textChunks,
      { type: 'error', error: new Error( 'provider chunk failed' ) },
      { type: 'finish', finishReason: 'error', usage: modelUsage }
    ];

    const stream = wrapStream( {
      name: 'streamText',
      prompt,
      fn: ( { onEndHook, onErrorHook, telemetry } ) => streamText( {
        model: streamingModel( chunks ),
        prompt: 'hi',
        telemetry,
        onEnd: response => onEndHook( response ),
        onError: event => onErrorHook( event )
      } )
    } );

    await consume( stream );

    await vi.waitFor( () => expect( billedUsage() ).toBeDefined() );
    expect( billedUsage() ).toMatchObject( { input: 10, output: 5, total: 15 } );
    expect( Tracing.addEventError ).toHaveBeenCalled();
  } );

  it( 'bills a stream that ends normally', async () => {
    const chunks = [ ...textChunks, { type: 'finish', finishReason: 'stop', usage: modelUsage } ];

    const stream = wrapStream( {
      name: 'streamText',
      prompt,
      fn: ( { onEndHook, onErrorHook, telemetry } ) => streamText( {
        model: streamingModel( chunks ),
        prompt: 'hi',
        telemetry,
        onEnd: response => onEndHook( response ),
        onError: event => onErrorHook( event )
      } )
    } );

    await consume( stream );

    await vi.waitFor( () => expect( billedUsage() ).toBeDefined() );
    expect( billedUsage() ).toMatchObject( { input: 10, output: 5, total: 15, status: 'complete' } );
    expect( Tracing.addEventError ).not.toHaveBeenCalled();
  } );

  it( 'bills the finished steps before the consumer sees an abort', async () => {
    const abortController = new AbortController();
    const state = { modelCalls: 0, billedAtAbort: undefined };
    const model = new MockLanguageModelV4( {
      doStream: async () => {
        state.modelCalls += 1;
        // cancel the run once the first step reported its usage, while the second one is starting
        if ( state.modelCalls > 1 ) {
          abortController.abort( new DOMException( 'Cancelled by caller', 'AbortError' ) );
        }
        const chunks = state.modelCalls === 1 ?
          toolCallChunks :
          [ ...textChunks, { type: 'finish', finishReason: 'stop', usage: modelUsage } ];
        return { stream: simulateReadableStream( { chunks } ) };
      }
    } );

    const stream = wrapStream( {
      name: 'streamText',
      prompt,
      abortSignal: abortController.signal,
      fn: ( { onEndHook, onErrorHook, telemetry } ) => streamText( {
        model,
        prompt: 'hi',
        abortSignal: abortController.signal,
        stopWhen: stepCountIs( 3 ),
        tools: { stop: tool( { inputSchema: z.object( {} ), execute: async () => 'stopped' } ) },
        telemetry,
        onEnd: response => onEndHook( response ),
        onError: event => onErrorHook( event )
      } )
    } );

    for await ( const part of stream.stream ) {
      if ( part.type === 'abort' ) {
        state.billedAtAbort = billedUsage();
      }
    }

    // the sdk awaits its abort event, so the spent tokens are billed before the cancellation lands
    expect( state.billedAtAbort ).toMatchObject( { input: 10, output: 5, total: 15 } );
  } );
} );
