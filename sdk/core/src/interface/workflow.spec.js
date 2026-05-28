import { ACTIVITY_WRAPPER_VERSION_FIELD, Signal, WORKFLOW_WRAPPER_VERSION_FIELD } from '#consts';
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
      if ( prop === '__internal#getTraceDestinations' ) {
        return traceDestinationsStepMock;
      }
      if ( typeof prop === 'string' && ( prop.includes( '#' ) ) ) {
        return stepSpy;
      }
      return vi.fn();
    }
  } );

const stepSpyRef = { current: vi.fn().mockResolvedValue( {} ) };
const proxyActivitiesMock = vi.fn( () => {
  stepSpyRef.current = vi.fn().mockResolvedValue( {} );
  return createStepsProxy( stepSpyRef.current );
} );

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

const emptyAggregations = {
  cost: { total: 0 },
  tokens: { total: 0 },
  httpRequests: { total: 0 }
};

describe( 'workflow()', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    inWorkflowContextMock.mockReturnValue( true );
    defineSignalMock.mockImplementation( name => name );
    workflowInfoMock.mockReturnValue( { ...workflowInfoReturn } );
    workflowInfoReturn.memo = {};
    proxyActivitiesMock.mockImplementation( () => {
      stepSpyRef.current = vi.fn().mockResolvedValue( {} );
      return createStepsProxy( stepSpyRef.current );
    } );
  } );

  describe( 'options and defaults', () => {
    it( 'does not throw when options is omitted (disableTrace defaults to false)', async () => {
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'no_options_wf',
        description: 'Workflow without options',
        inputSchema: z.object( { value: z.string() } ),
        outputSchema: z.object( { value: z.string() } ),
        fn: async ( { value } ) => ( { value } )
      } );

      const result = await wf( { value: 'hello' } );
      expect( result.output ).toEqual( { value: 'hello' } );
    } );

    it( 'respects disableTrace: true when options is provided', async () => {
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'trace_disabled_wf',
        description: 'Workflow with tracing disabled',
        inputSchema: z.object( { value: z.string() } ),
        outputSchema: z.object( { value: z.string() } ),
        options: { disableTrace: true },
        fn: async ( { value } ) => ( { value } )
      } );

      const result = await wf( { value: 'hello' } );
      expect( result.output ).toEqual( { value: 'hello' } );
    } );

    it( 'merges custom activityOptions with defaults via deepMerge', async () => {
      const { workflow } = await import( './workflow.js' );

      workflow( {
        name: 'custom_activity_wf',
        description: 'Workflow with custom activity options',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        options: {
          activityOptions: {
            startToCloseTimeout: '5m',
            retry: { maximumAttempts: 5 }
          }
        },
        fn: async () => ( {} )
      } );

      expect( proxyActivitiesMock ).toHaveBeenCalledWith(
        expect.objectContaining( {
          startToCloseTimeout: '5m',
          retry: expect.objectContaining( { maximumAttempts: 5 } )
        } )
      );
    } );
  } );

  describe( 'wrapper metadata', () => {
    it( 'attaches name, description, inputSchema, outputSchema to wrapper via setMetadata', async () => {
      const { workflow } = await import( './workflow.js' );
      const inputSchema = z.object( { x: z.number() } );
      const outputSchema = z.object( { y: z.number() } );

      const wf = workflow( {
        name: 'meta_wf',
        description: 'Meta workflow',
        inputSchema,
        outputSchema,
        fn: async input => ( { y: input.x } )
      } );

      const symbols = Object.getOwnPropertySymbols( wf );
      expect( symbols ).toHaveLength( 1 );
      const meta = wf[symbols[0]];
      expect( meta ).toEqual( { name: 'meta_wf', description: 'Meta workflow', inputSchema, outputSchema, aliases: [] } );
    } );
  } );

  describe( 'when not in workflow context (unit-test path)', () => {
    it( 'validates input, runs fn with test context, validates output, returns plain output', async () => {
      inWorkflowContextMock.mockReturnValue( false );
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'unit_path_wf',
        description: 'Unit path',
        inputSchema: z.object( { a: z.string() } ),
        outputSchema: z.object( { b: z.string() } ),
        fn: async ( input, context ) => ( {
          b: String( context.info.workflowId ) + input.a
        } )
      } );

      const result = await wf( { a: '-ok' } );
      expect( result ).toEqual( { b: 'test-workflow-ok' } );
      expect( workflowInfoMock ).not.toHaveBeenCalled();
      expect( traceDestinationsStepMock ).not.toHaveBeenCalled();
    } );

    it( 'merges extra.context into context when provided', async () => {
      inWorkflowContextMock.mockReturnValue( false );
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'extra_ctx_wf',
        description: 'Extra context',
        inputSchema: z.object( {} ),
        outputSchema: z.object( { id: z.string() } ),
        fn: async ( _, context ) => ( { id: context.extraId ?? 'default' } )
      } );

      const result = await wf( {}, { context: { extraId: 'injected' } } );
      expect( result ).toEqual( { id: 'injected' } );
    } );
  } );

  describe( 'input and output validation', () => {
    it( 'throws ValidationError when input does not match inputSchema', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ValidationError } = await import( '#errors' );

      const wf = workflow( {
        name: 'validate_in_wf',
        description: 'Input validation',
        inputSchema: z.object( { required: z.string() } ),
        outputSchema: z.object( {} ),
        fn: async () => ( {} )
      } );

      await expect( wf( { wrong: 1 } ) ).rejects.toThrow( ValidationError );
      await expect( wf( { wrong: 1 } ) ).rejects.toThrow( /Workflow validate_in_wf input/ );
    } );

    it( 'throws ValidationError when output does not match outputSchema', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ValidationError } = await import( '#errors' );

      const wf = workflow( {
        name: 'validate_out_wf',
        description: 'Output validation',
        inputSchema: z.object( {} ),
        outputSchema: z.object( { required: z.string() } ),
        fn: async () => ( { other: 1 } )
      } );

      await expect( wf( {} ) ).rejects.toThrow( ValidationError );
      await expect( wf( {} ) ).rejects.toThrow( /Workflow validate_out_wf output/ );
    } );
  } );

  describe( 'root workflow (in workflow context)', () => {
    it( 'unwraps wrapped trace destinations and assigns executionContext to memo', async () => {
      traceDestinationsStepMock.mockResolvedValueOnce( {
        output: { local: '/tmp/wrapped-trace' },
        aggregations: emptyAggregations,
        [ACTIVITY_WRAPPER_VERSION_FIELD]: 1
      } );
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'wrapped_trace_wf',
        description: 'Wrapped trace',
        inputSchema: z.object( {} ),
        outputSchema: z.object( { ok: z.boolean() } ),
        fn: async () => ( { ok: true } )
      } );

      const result = await wf( {} );
      expect( traceDestinationsStepMock ).toHaveBeenCalledTimes( 1 );
      expect( result ).toEqual( {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        output: { ok: true },
        trace: { destinations: { local: '/tmp/wrapped-trace' } },
        aggregations: emptyAggregations
      } );
      const memo = workflowInfoMock().memo;
      expect( memo.executionContext ).toEqual( {
        workflowId: 'wf-test-123',
        workflowName: 'wrapped_trace_wf',
        disableTrace: false,
        startTime: new Date( '2025-01-01T00:00:00Z' ).getTime()
      } );
    } );

    it( 'collects batched aggregation signals from failed activities', async () => {
      const { workflow } = await import( './workflow.js' );
      const handlers = { sendAggregations: () => {} };
      setHandlerMock.mockImplementation( ( signalName, handler ) => {
        if ( signalName === Signal.SEND_AGGREGATIONS ) {
          handlers.sendAggregations = handler;
        }
      } );

      const wf = workflow( {
        name: 'batched_attr_wf',
        description: 'Batched aggregations',
        inputSchema: z.object( {} ),
        outputSchema: z.object( { ok: z.boolean() } ),
        fn: async () => {
          handlers.sendAggregations( { cost: { total: 3 }, tokens: { total: 0 }, httpRequests: { total: 1 } } );
          return { ok: true };
        }
      } );

      const result = await wf( {} );
      expect( result.cost ).toBeUndefined();
      expect( result ).not.toHaveProperty( 'attributes' );
      expect( result.aggregations.cost ).toEqual( { total: 3 } );
      expect( result.aggregations.httpRequests ).toEqual( { total: 1 } );
    } );

    it( 'sets executionContext.disableTrace when options.disableTrace is true', async () => {
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'root_no_trace_wf',
        description: 'Root no trace',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        options: { disableTrace: true },
        fn: async () => ( {} )
      } );

      await wf( {} );
      expect( workflowInfoMock().memo.executionContext.disableTrace ).toBe( true );
    } );
  } );

  describe( 'child workflow (memo.executionContext already set)', () => {
    it( 'does not call getTraceDestinations and returns an internal output envelope', async () => {
      workflowInfoMock.mockReturnValue( {
        ...workflowInfoReturn,
        memo: { executionContext: { workflowId: 'parent-1', workflowName: 'parent_wf' } }
      } );
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'child_wf',
        description: 'Child',
        inputSchema: z.object( {} ),
        outputSchema: z.object( { x: z.string() } ),
        fn: async () => ( { x: 'child' } )
      } );

      const result = await wf( {} );
      expect( traceDestinationsStepMock ).not.toHaveBeenCalled();
      expect( result ).toEqual( {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        output: { x: 'child' },
        aggregations: emptyAggregations
      } );
    } );
  } );

  describe( 'bound this: invokeStep, invokeSharedStep, invokeEvaluator', () => {
    it( 'invokeStep unwraps step output and merges step aggregations', async () => {
      const stepSpy = vi.fn().mockResolvedValue( {
        output: { value: 'wrapped' },
        aggregations: { cost: { total: 0 }, tokens: { total: 0 }, httpRequests: { total: 1 } },
        [ACTIVITY_WRAPPER_VERSION_FIELD]: 1
      } );
      proxyActivitiesMock.mockImplementation( () => createStepsProxy( stepSpy ) );

      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'unwrap_step_wf',
        description: 'Unwrap step',
        inputSchema: z.object( {} ),
        outputSchema: z.object( { value: z.string() } ),
        async fn() {
          return this.invokeStep( 'myStep', { foo: 1 } );
        }
      } );

      const result = await wf( {} );
      expect( result.output ).toEqual( { value: 'wrapped' } );
      expect( result ).not.toHaveProperty( 'attributes' );
      expect( result.aggregations.httpRequests ).toEqual( { total: 1 } );
    } );

    it( 'invokeSharedStep calls steps with SHARED_STEP_PREFIX#stepName', async () => {
      const { workflow } = await import( './workflow.js' );
      const sharedSpy = vi.fn().mockResolvedValue( {} );
      proxyActivitiesMock.mockImplementation( () => new Proxy( {}, {
        get: ( _, prop ) => {
          if ( prop === '__internal#getTraceDestinations' ) {
            return traceDestinationsStepMock;
          }
          if ( prop === '__shared#sharedStep' ) {
            return sharedSpy;
          }
          return vi.fn();
        }
      } ) );

      const wf = workflow( {
        name: 'shared_wf',
        description: 'Shared',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        async fn() {
          await this.invokeSharedStep( 'sharedStep', { data: 2 } );
          return {};
        }
      } );

      await wf( {} );
      expect( sharedSpy ).toHaveBeenCalledWith( { data: 2 }, undefined );
    } );

    it( 'invokeEvaluator calls steps with workflowName#evaluatorName', async () => {
      const evalSpy = vi.fn().mockResolvedValue( true );
      proxyActivitiesMock.mockImplementation( () => new Proxy( {}, {
        get: ( _, prop ) => {
          if ( prop === '__internal#getTraceDestinations' ) {
            return traceDestinationsStepMock;
          }
          if ( prop === 'eval_wf#myEvaluator' ) {
            return evalSpy;
          }
          return vi.fn();
        }
      } ) );

      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'eval_wf',
        description: 'Eval',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        async fn() {
          await this.invokeEvaluator( 'myEvaluator', { x: 3 } );
          return {};
        }
      } );

      await wf( {} );
      expect( evalSpy ).toHaveBeenCalledWith( { x: 3 }, undefined );
    } );
  } );

  describe( 'startWorkflow', () => {
    it( 'calls executeChild with correct args and TERMINATE when not detached', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ParentClosePolicy } = await import( '@temporalio/workflow' );
      executeChildMock.mockResolvedValueOnce( { output: {}, aggregations: emptyAggregations } );

      const wf = workflow( {
        name: 'parent_wf',
        description: 'Parent',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        async fn() {
          await this.startWorkflow( 'child_wf', { id: 1 } );
          return {};
        }
      } );

      await wf( {} );
      expect( executeChildMock ).toHaveBeenCalledWith( 'child_wf', {
        args: [ { id: 1 } ],
        workflowId: expect.stringMatching( /^wf-test-123-/ ),
        parentClosePolicy: ParentClosePolicy.TERMINATE,
        memo: expect.objectContaining( {
          executionContext: expect.any( Object ),
          parentId: 'wf-test-123'
        } )
      } );
    } );

    it( 'uses ABANDON when extra.detached is true', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ParentClosePolicy } = await import( '@temporalio/workflow' );
      executeChildMock.mockResolvedValueOnce( { output: {}, aggregations: emptyAggregations } );

      const wf = workflow( {
        name: 'detach_wf',
        description: 'Detach',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        async fn() {
          await this.startWorkflow( 'child_wf', null, { detached: true } );
          return {};
        }
      } );

      await wf( {} );
      expect( executeChildMock ).toHaveBeenCalledWith( 'child_wf', expect.objectContaining( {
        parentClosePolicy: ParentClosePolicy.ABANDON
      } ) );
    } );

    it( 'passes empty args when input is null/omitted', async () => {
      const { workflow } = await import( './workflow.js' );
      executeChildMock.mockResolvedValueOnce( { output: {}, aggregations: emptyAggregations } );

      const wf = workflow( {
        name: 'no_input_wf',
        description: 'No input',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        async fn() {
          await this.startWorkflow( 'child_wf' );
          return {};
        }
      } );

      await wf( {} );
      expect( executeChildMock ).toHaveBeenCalledWith( 'child_wf', expect.objectContaining( {
        args: []
      } ) );
    } );

    it( 'returns child output and merges child workflow aggregations into the root aggregations', async () => {
      const { workflow } = await import( './workflow.js' );
      executeChildMock.mockResolvedValueOnce( {
        output: { child: 'ok' },
        aggregations: {
          cost: { total: 1.5 },
          tokens: { total: 4, input: 4 },
          httpRequests: { total: 2 }
        }
      } );

      const wf = workflow( {
        name: 'merge_child_aggregations_wf',
        description: 'Merge child aggregations',
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
          cost: { total: 1.5 },
          tokens: { total: 4, input: 4 },
          httpRequests: { total: 2 }
        }
      } );
    } );

    it( 'merges child error aggregations before rethrowing to root metadata', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ChildWorkflowFailure } = await import( '@temporalio/workflow' );
      const { METADATA_ACCESS_SYMBOL } = await import( '#consts' );
      const childError = new ChildWorkflowFailure( 'child failed', {
        message: 'Child workflow execution failed',
        details: [ {
          aggregations: {
            cost: { total: 3 },
            tokens: { total: 8, output: 8 },
            httpRequests: { total: 0 }
          }
        } ]
      } );
      executeChildMock.mockRejectedValueOnce( childError );

      const wf = workflow( {
        name: 'child_error_aggregations_wf',
        description: 'Child error aggregations',
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
          cost: { total: 3 },
          tokens: { total: 8, output: 8 },
          httpRequests: { total: 0 }
        }
      } );
    } );
  } );

  describe( 'error handling (root workflow)', () => {
    it( 'rethrows error from fn with trace and aggregation metadata', async () => {
      const { workflow } = await import( './workflow.js' );
      const { METADATA_ACCESS_SYMBOL } = await import( '#consts' );
      const error = new Error( 'workflow failed' );

      const wf = workflow( {
        name: 'err_wf',
        description: 'Error',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        fn: async () => {
          throw error;
        }
      } );

      await expect( wf( {} ) ).rejects.toThrow( 'workflow failed' );
      expect( error[METADATA_ACCESS_SYMBOL] ).toEqual( {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        trace: { destinations: { local: '/tmp/trace' } },
        aggregations: emptyAggregations
      } );
    } );
  } );
} );
