import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateText, streamText } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
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
      fn: ( { onEndHook, onErrorHook, onStepEndHook } ) => streamText( {
        model: streamingModel( chunks ),
        prompt: 'hi',
        onStepEnd: onStepEndHook,
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
      fn: ( { onEndHook, onErrorHook, onStepEndHook } ) => streamText( {
        model: streamingModel( chunks ),
        prompt: 'hi',
        onStepEnd: onStepEndHook,
        onEnd: response => onEndHook( response ),
        onError: event => onErrorHook( event )
      } )
    } );

    await consume( stream );

    await vi.waitFor( () => expect( billedUsage() ).toBeDefined() );
    expect( billedUsage() ).toMatchObject( { input: 10, output: 5, total: 15, status: 'complete' } );
    expect( Tracing.addEventError ).not.toHaveBeenCalled();
  } );
} );
