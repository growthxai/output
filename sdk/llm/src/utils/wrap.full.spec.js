import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateText, streamText, stepCountIs, tool, ToolLoopAgent } from 'ai';
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

/** Grounded prompt, so the web searches reported by the steps resolve to a per-query billing unit */
const groundedPrompt = {
  name: 'writer@v1',
  config: { provider: 'google-vertex', model: 'gemini-3-pro' }
};

const mockCost = { type: 'llm:generation:cost', total: 0.001, items: [] };

/** Provider metadata a grounded Vertex step carries */
const groundedMetadata = webSearchQueries => ( { vertex: { groundingMetadata: { webSearchQueries } } } );

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

  // Grounding is reported per step, so a run that never reaches `onEnd` has the step events as its only record
  it( 'sums the tokens and the grounding of every completed step when the run fails mid loop', async () => {
    const state = { modelCalls: 0 };
    const model = new MockLanguageModelV4( {
      doGenerate: async () => {
        state.modelCalls += 1;
        // two grounded steps finish, then the provider fails the third one
        if ( state.modelCalls > 2 ) {
          throw new Error( 'provider failed mid loop' );
        }
        return {
          content: [ { type: 'tool-call', toolCallId: `call-${state.modelCalls}`, toolName: 'search', input: '{}' } ],
          finishReason: 'tool-calls',
          usage: modelUsage,
          providerMetadata: groundedMetadata( [ 'a', 'b' ] ),
          warnings: []
        };
      }
    } );

    await expect( wrapTextGeneration( {
      name: 'generateText',
      prompt: groundedPrompt,
      fn: wiringOptions => generateText( {
        model,
        prompt: 'hi',
        maxRetries: 0,
        stopWhen: stepCountIs( 5 ),
        tools: { search: tool( { inputSchema: z.object( {} ), execute: async () => 'result' } ) },
        ...wiringOptions
      } )
    } ) ).rejects.toThrow();

    // per-step usage, summed: treating the aggregate as per-step would double-count
    expect( billedUsage() ).toMatchObject( {
      input: 20,
      output: 10,
      total: 30,
      items: expect.arrayContaining( [ { group: 'tools', label: 'grounding_query', amount: 4 } ] )
    } );
  } );

  // Agents forward call options through `prepareCall`, which keeps `telemetry` only as an unknown key
  it( 'bills an agent generation, so the telemetry option must survive prepareCall', async () => {
    const agent = new ToolLoopAgent( { model: generatingModel() } );

    const wrapped = await wrapTextGeneration( {
      name: 'Agent.generate',
      prompt,
      fn: wiringOptions => agent.generate( { messages: [ { role: 'user', content: 'hi' } ], ...wiringOptions } )
    } );

    expect( billedUsage() ).toMatchObject( { input: 10, output: 5, total: 15, status: 'complete' } );
    expect( wrapped.cost ).toBe( mockCost );
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
