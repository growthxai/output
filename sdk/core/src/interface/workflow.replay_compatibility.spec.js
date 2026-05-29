import { ACTIVITY_GET_TRACE_DESTINATIONS, METADATA_ACCESS_SYMBOL, WORKFLOW_WRAPPER_VERSION_FIELD } from '#consts';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const inWorkflowContextMock = vi.hoisted( () => vi.fn( () => true ) );
const defineSignalMock = vi.hoisted( () => vi.fn( name => name ) );
const setHandlerMock = vi.hoisted( () => vi.fn() );
const traceDestinationsStepMock = vi.fn().mockResolvedValue( { local: '/tmp/trace' } );
const executeChildMock = vi.fn().mockResolvedValue( undefined );
const continueAsNewMock = vi.fn().mockResolvedValue( undefined );

const createStepsProxy = ( stepSpy = vi.fn() ) =>
  new Proxy( {}, {
    get: ( _, prop ) => {
      if ( prop === ACTIVITY_GET_TRACE_DESTINATIONS ) {
        return traceDestinationsStepMock;
      }
      if ( typeof prop === 'string' && prop.includes( '#' ) ) {
        return stepSpy;
      }
      return vi.fn();
    }
  } );

const proxyActivitiesMock = vi.fn( () => createStepsProxy() );

const workflowInfoReturn = {
  workflowId: 'wf-test-123',
  workflowType: 'test_wf',
  memo: {},
  startTime: new Date( '2025-01-01T00:00:00Z' ),
  continueAsNewSuggested: false
};
const workflowInfoMock = vi.fn( () => ( { ...workflowInfoReturn } ) );

vi.mock( '@temporalio/workflow', () => ( {
  proxyActivities: ( ...args ) => proxyActivitiesMock( ...args ),
  inWorkflowContext: inWorkflowContextMock,
  executeChild: ( ...args ) => executeChildMock( ...args ),
  workflowInfo: workflowInfoMock,
  uuid4: () => '550e8400e29b41d4a716446655440000',
  ParentClosePolicy: { TERMINATE: 'TERMINATE', ABANDON: 'ABANDON' },
  ChildWorkflowFailure: class ChildWorkflowFailure extends Error {
    constructor( message, cause ) {
      super( message );
      this.name = 'ChildWorkflowFailure';
      this.cause = cause;
    }
  },
  continueAsNew: continueAsNewMock,
  defineSignal: ( ...args ) => defineSignalMock( ...args ),
  setHandler: ( ...args ) => setHandlerMock( ...args )
} ) );

vi.mock( '#consts', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    SHARED_STEP_PREFIX: '__shared',
    ACTIVITY_GET_TRACE_DESTINATIONS: '__internal#getTraceDestinations'
  };
} );

describe( 'workflow() replay compatibility', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    inWorkflowContextMock.mockReturnValue( true );
    defineSignalMock.mockImplementation( name => name );
    workflowInfoReturn.memo = {};
    workflowInfoMock.mockReturnValue( { ...workflowInfoReturn } );
    proxyActivitiesMock.mockImplementation( () => createStepsProxy() );
    traceDestinationsStepMock.mockResolvedValue( { local: '/tmp/trace' } );
  } );

  it( 'preserves old plain trace destination activity results', async () => {
    const { workflow } = await import( './workflow.js' );

    const wf = workflow( {
      name: 'root_wf',
      description: 'Root',
      inputSchema: z.object( {} ),
      outputSchema: z.object( { v: z.number() } ),
      fn: async () => ( { v: 42 } )
    } );

    const result = await wf( {} );
    expect( result ).toEqual( {
      [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
      output: { v: 42 },
      trace: { destinations: { local: '/tmp/trace' } },
      aggregations: null
    } );
  } );

  it( 'converts old add_attribute signals into aggregations', async () => {
    const { workflow } = await import( './workflow.js' );
    const { Attribute } = await import( '#trace_attribute' );
    const handlers = { addAttribute: () => {} };
    setHandlerMock.mockImplementation( ( signalName, handler ) => {
      if ( signalName === 'add_attribute' ) {
        handlers.addAttribute = handler;
      }
    } );

    const httpRequest = {
      type: Attribute.HTTPRequestCount.TYPE,
      url: 'https://api.example.test/items',
      requestId: 'req-1'
    };
    const httpCost = {
      type: Attribute.HTTPRequestCost.TYPE,
      url: 'https://api.example.test/items',
      requestId: 'req-1',
      total: 2.5
    };
    const llmUsage = {
      type: Attribute.LLMUsage.TYPE,
      modelId: 'gpt-4o',
      total: 0.25,
      usage: [
        { type: 'input', ppm: 5, amount: 20_000, total: 0.1 },
        { type: 'output', ppm: 30, amount: 5_000, total: 0.15 }
      ],
      tokensUsed: 25_000
    };

    const wf = workflow( {
      name: 'attr_wf',
      description: 'Attributes',
      inputSchema: z.object( {} ),
      outputSchema: z.object( { ok: z.boolean() } ),
      fn: async () => {
        handlers.addAttribute( httpRequest );
        handlers.addAttribute( httpCost );
        handlers.addAttribute( llmUsage );
        return { ok: true };
      }
    } );

    const result = await wf( {} );
    expect( result ).not.toHaveProperty( 'attributes' );
    expect( result.aggregations ).toEqual( {
      cost: { total: 2.75 },
      tokens: {
        total: 25_000,
        input: 20_000,
        output: 5_000
      },
      httpRequests: { total: 1 }
    } );
  } );

  it( 'preserves old plain activity results from steps', async () => {
    const stepSpy = vi.fn().mockResolvedValue( { legacy: true } );
    proxyActivitiesMock.mockImplementation( () => createStepsProxy( stepSpy ) );
    const { workflow } = await import( './workflow.js' );

    const wf = workflow( {
      name: 'legacy_step_wf',
      description: 'Legacy step result',
      inputSchema: z.object( {} ),
      outputSchema: z.object( { legacy: z.boolean() } ),
      async fn() {
        return this.invokeStep( 'myStep', { foo: 1 } );
      }
    } );

    const result = await wf( {} );
    expect( result.output ).toEqual( { legacy: true } );
    expect( result.aggregations ).toEqual( null );
  } );

  it( 'converts old child workflow attributes into parent aggregations', async () => {
    const { workflow } = await import( './workflow.js' );
    const { Attribute } = await import( '#trace_attribute' );
    const childAttribute = {
      type: Attribute.LLMUsage.TYPE,
      modelId: 'gpt-4o',
      total: 0.4,
      tokensUsed: 20,
      usage: [
        { type: 'input', ppm: 10, amount: 20, total: 0.4 }
      ]
    };
    executeChildMock.mockResolvedValueOnce( {
      output: { child: 'ok' },
      attributes: [ childAttribute ]
    } );

    const wf = workflow( {
      name: 'merge_child_wf',
      description: 'Merge child attributes',
      inputSchema: z.object( {} ),
      outputSchema: z.object( { child: z.string() } ),
      async fn() {
        return this.startWorkflow( 'child_wf', { id: 1 } );
      }
    } );

    const result = await wf( {} );
    expect( result ).toEqual( {
      [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
      output: { child: 'ok' },
      trace: { destinations: { local: '/tmp/trace' } },
      aggregations: {
        cost: { total: 0.4 },
        tokens: {
          total: 20,
          input: 20
        },
        httpRequests: { total: 0 }
      }
    } );
  } );

  it( 'converts old child workflow error attributes into parent error metadata aggregations', async () => {
    const { workflow } = await import( './workflow.js' );
    const { ChildWorkflowFailure } = await import( '@temporalio/workflow' );
    const { Attribute } = await import( '#trace_attribute' );
    const childAttribute = {
      type: Attribute.HTTPRequestCost.TYPE,
      url: 'https://api.example.test',
      requestId: 'req-child',
      total: 2
    };
    const childError = new ChildWorkflowFailure( 'child failed', {
      message: 'Child workflow execution failed',
      details: [ { attributes: [ childAttribute ] } ]
    } );
    executeChildMock.mockRejectedValueOnce( childError );

    const wf = workflow( {
      name: 'child_error_wf',
      description: 'Child error attributes',
      inputSchema: z.object( {} ),
      outputSchema: z.object( {} ),
      async fn() {
        await this.startWorkflow( 'child_wf', { id: 1 } );
        return {};
      }
    } );

    await expect( wf( {} ) ).rejects.toThrow( 'child failed' );
    expect( childError[METADATA_ACCESS_SYMBOL] ).toEqual( {
      [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
      trace: { destinations: { local: '/tmp/trace' } },
      aggregations: {
        cost: { total: 2 },
        tokens: { total: 0 },
        httpRequests: { total: 0 }
      }
    } );
  } );
} );
