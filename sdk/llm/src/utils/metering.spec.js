import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted( () => ( {
  parseLLMUsage: vi.fn(),
  calculateCosts: vi.fn(),
  convertCostToLegacy: vi.fn(),
  logger: { error: vi.fn() }
} ) );

vi.mock( '@outputai/core', () => ( {
  Logger: mocks.logger
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

vi.mock( '@outputai/core/sdk/runtime', () => ( {
  Tracing: {
    addEventAttribute: vi.fn()
  },
  Event: {
    emit: vi.fn()
  }
} ) );

import { Tracing, Event } from '@outputai/core/sdk/runtime';
import { Metering } from './metering.js';

const tracing = vi.mocked( Tracing, true );
const event = vi.mocked( Event, true );

const traceId = 'generateText-9000000000-a1b2c3d4';

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

const step = tokens => ( { usage: { inputTokens: tokens, outputTokens: tokens } } );

const attributesOf = calls => calls.map( ( [ { attribute } ] ) => attribute );
const eventNames = calls => calls.map( ( [ name ] ) => name );

describe( 'Metering', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mocks.parseLLMUsage.mockReturnValue( mockUsage );
    mocks.calculateCosts.mockResolvedValue( mockCost );
    mocks.convertCostToLegacy.mockReturnValue( mockLegacyCost );
  } );

  it( 'bills the response usage and steps', async () => {
    const response = { usage: { inputTokens: 2, outputTokens: 1 }, steps: [ step( 2 ) ] };
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( response );

    expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( {
      prompt,
      usage: response.usage,
      steps: response.steps
    } );
    expect( mocks.calculateCosts ).toHaveBeenCalledWith( mockUsage );
    expect( metering.attributes ).toEqual( { usage: mockUsage, cost: mockCost, legacy: mockLegacyCost } );
  } );

  it( 'prefers the response steps over the recorded ones', async () => {
    const responseSteps = [ step( 10 ), step( 20 ) ];
    const metering = new Metering( { traceId, prompt } );

    metering.recordStep( step( 1 ) );
    await metering.bill( { usage: { inputTokens: 30 }, steps: responseSteps } );

    expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( expect.objectContaining( { steps: responseSteps } ) );
  } );

  it( 'falls back to the recorded steps when the response reports none', async () => {
    const recorded = [ step( 5 ), step( 7 ) ];
    const metering = new Metering( { traceId, prompt } );

    recorded.forEach( metering.recordStep );
    await metering.bill( { usage: { inputTokens: 12 }, steps: [] } );

    expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( expect.objectContaining( { steps: recorded } ) );
  } );

  it( 'bills the collected steps when billed without a response', async () => {
    const metering = new Metering( { traceId, prompt } );

    metering.recordStep( step( 5 ) );
    await metering.bill();

    expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( {
      prompt,
      usage: undefined,
      steps: [ step( 5 ) ]
    } );
  } );

  it( 'records steps through a detached method reference', async () => {
    const metering = new Metering( { traceId, prompt } );
    const record = metering.recordStep;

    record( step( 9 ) );
    await metering.bill();

    expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( expect.objectContaining( { steps: [ step( 9 ) ] } ) );
  } );

  it( 'attaches the usage, cost and legacy attributes to the trace', async () => {
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( { usage: { inputTokens: 2 }, steps: [] } );

    expect( tracing.addEventAttribute ).toHaveBeenCalledTimes( 3 );
    expect( attributesOf( tracing.addEventAttribute.mock.calls ) ).toEqual( [ mockUsage, mockCost, mockLegacyCost ] );
    tracing.addEventAttribute.mock.calls.forEach( ( [ call ] ) => {
      expect( call.eventId ).toBe( traceId );
    } );
  } );

  it( 'emits the metering event and the legacy cost event with cloned payloads', async () => {
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( { usage: { inputTokens: 2 }, steps: [] } );

    expect( eventNames( event.emit.mock.calls ) ).toEqual( [ 'llm:generation:metering', 'cost:llm:request' ] );

    const [ [ , meteringPayload ], [ , legacyPayload ] ] = event.emit.mock.calls;
    expect( meteringPayload ).toEqual( { cost: mockCost, usage: mockUsage } );
    expect( meteringPayload.usage ).not.toBe( mockUsage );
    expect( legacyPayload ).toEqual( mockLegacyCost );
    expect( legacyPayload ).not.toBe( mockLegacyCost );
  } );

  it( 'bills only once', async () => {
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( { usage: { inputTokens: 2 }, steps: [] } );
    await metering.bill( { usage: { inputTokens: 2 }, steps: [] } );

    expect( mocks.parseLLMUsage ).toHaveBeenCalledTimes( 1 );
    expect( event.emit ).toHaveBeenCalledTimes( 2 );
    expect( tracing.addEventAttribute ).toHaveBeenCalledTimes( 3 );
  } );

  it( 'ignores records that arrive after billing', async () => {
    const metering = new Metering( { traceId, prompt } );

    metering.recordStep( step( 1 ) );
    await metering.bill();

    metering.recordStep( step( 99 ) );
    await metering.bill( { usage: { inputTokens: 99 }, steps: [ step( 99 ) ] } );

    expect( mocks.parseLLMUsage ).toHaveBeenCalledTimes( 1 );
    expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( expect.objectContaining( { steps: [ step( 1 ) ] } ) );
  } );

  it( 'stays open when billed before anything was recorded', async () => {
    const metering = new Metering( { traceId, prompt } );

    await metering.bill();

    expect( mocks.parseLLMUsage ).not.toHaveBeenCalled();

    await metering.bill( { usage: { inputTokens: 2 }, steps: [ step( 2 ) ] } );

    expect( mocks.parseLLMUsage ).toHaveBeenCalledOnce();
    expect( metering.attributes.cost ).toBe( mockCost );
  } );

  it( 'stays open when the response reports neither usage nor steps', async () => {
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( { steps: [] } );

    expect( mocks.parseLLMUsage ).not.toHaveBeenCalled();

    metering.recordStep( step( 3 ) );
    await metering.bill();

    expect( mocks.parseLLMUsage ).toHaveBeenCalledWith( expect.objectContaining( { steps: [ step( 3 ) ] } ) );
  } );

  it( 'skips costing, attributes and events when the recorded usage cannot be parsed', async () => {
    mocks.parseLLMUsage.mockReturnValue( null );
    const metering = new Metering( { traceId, prompt } );

    metering.recordStep( step( 2 ) );
    await metering.bill();

    expect( mocks.calculateCosts ).not.toHaveBeenCalled();
    expect( tracing.addEventAttribute ).not.toHaveBeenCalled();
    expect( event.emit ).not.toHaveBeenCalled();
    expect( metering.attributes ).toEqual( { usage: null, cost: null, legacy: null } );
  } );

  it( 'reports usage with a null cost when costing yields nothing', async () => {
    mocks.calculateCosts.mockResolvedValue( null );
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( { usage: { inputTokens: 2 }, steps: [] } );

    expect( mocks.convertCostToLegacy ).not.toHaveBeenCalled();
    expect( attributesOf( tracing.addEventAttribute.mock.calls ) ).toEqual( [ mockUsage ] );
    expect( eventNames( event.emit.mock.calls ) ).toEqual( [ 'llm:generation:metering' ] );
    expect( event.emit.mock.calls[0][1] ).toEqual( { cost: null, usage: mockUsage } );
  } );

  it( 'skips the legacy payload when the conversion yields nothing', async () => {
    mocks.convertCostToLegacy.mockReturnValue( null );
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( { usage: { inputTokens: 2 }, steps: [] } );

    expect( attributesOf( tracing.addEventAttribute.mock.calls ) ).toEqual( [ mockUsage, mockCost ] );
    expect( eventNames( event.emit.mock.calls ) ).toEqual( [ 'llm:generation:metering' ] );
  } );

  it( 'never throws when parsing the usage fails', async () => {
    mocks.parseLLMUsage.mockImplementation( () => {
      throw new Error( 'bad usage' );
    } );
    const metering = new Metering( { traceId, prompt } );

    metering.recordStep( step( 2 ) );
    await expect( metering.bill() ).resolves.toBeUndefined();

    expect( mocks.logger.error ).toHaveBeenCalledWith( 'Metering failed', { namespace: 'LLM', error: 'bad usage' } );
    expect( event.emit ).not.toHaveBeenCalled();
    expect( tracing.addEventAttribute ).not.toHaveBeenCalled();
  } );

  it( 'never throws when costing rejects, and reports no cost', async () => {
    mocks.calculateCosts.mockRejectedValue( new Error( 'pricing unavailable' ) );
    const metering = new Metering( { traceId, prompt } );

    await expect( metering.bill( { usage: { inputTokens: 2 }, steps: [] } ) ).resolves.toBeUndefined();

    expect( mocks.logger.error ).toHaveBeenCalledWith( 'Metering failed', { namespace: 'LLM', error: 'pricing unavailable' } );
    expect( event.emit ).not.toHaveBeenCalled();
    expect( tracing.addEventAttribute ).not.toHaveBeenCalled();
    expect( metering.attributes ).toEqual( { usage: mockUsage, cost: null, legacy: null } );
  } );

  it( 'logs a non-error throw by its string value', async () => {
    mocks.calculateCosts.mockRejectedValue( 'pricing exploded' );
    const metering = new Metering( { traceId, prompt } );

    await metering.bill( { usage: { inputTokens: 2 }, steps: [] } );

    expect( mocks.logger.error ).toHaveBeenCalledWith( 'Metering failed', { namespace: 'LLM', error: 'pricing exploded' } );
  } );
} );
