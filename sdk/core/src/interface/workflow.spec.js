import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const inWorkflowContextMock = vi.hoisted( () => vi.fn( () => true ) );
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
  continueAsNew: continueAsNewMock
} ) );

vi.mock( '#consts', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    SHARED_STEP_PREFIX: '__shared',
    ACTIVITY_GET_TRACE_DESTINATIONS: '__internal#getTraceDestinations'
  };
} );

describe( 'workflow()', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    inWorkflowContextMock.mockReturnValue( true );
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
    it( 'calls getTraceDestinations, returns { output, trace } and assigns executionContext to memo', async () => {
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'root_wf',
        description: 'Root',
        inputSchema: z.object( {} ),
        outputSchema: z.object( { v: z.number() } ),
        fn: async () => ( { v: 42 } )
      } );

      const result = await wf( {} );
      expect( traceDestinationsStepMock ).toHaveBeenCalledTimes( 1 );
      expect( result ).toEqual( {
        output: { v: 42 },
        trace: { destinations: { local: '/tmp/trace' } }
      } );
      const memo = workflowInfoMock().memo;
      expect( memo.executionContext ).toEqual( {
        workflowId: 'wf-test-123',
        workflowName: 'root_wf',
        disableTrace: false,
        startTime: new Date( '2025-01-01T00:00:00Z' ).getTime()
      } );
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
    it( 'does not call getTraceDestinations and returns plain output', async () => {
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
      expect( result ).toEqual( { x: 'child' } );
    } );
  } );

  describe( 'bound this: invokeStep, invokeSharedStep, invokeEvaluator', () => {
    it( 'invokeStep calls steps with workflowName#stepName', async () => {
      const getCalls = [];
      proxyActivitiesMock.mockImplementation( () => new Proxy( {}, {
        get: ( _, prop ) => {
          if ( prop === '__internal#getTraceDestinations' ) {
            return traceDestinationsStepMock;
          }
          if ( typeof prop === 'string' && prop.includes( '#' ) ) {
            getCalls.push( prop );
            return vi.fn().mockResolvedValue( {} );
          }
          return vi.fn();
        }
      } ) );

      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'invoke_wf',
        description: 'Invoke',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        async fn() {
          await this.invokeStep( 'myStep', { foo: 1 } );
          return {};
        }
      } );

      await wf( {} );
      expect( getCalls ).toContain( 'invoke_wf#myStep' );
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
  } );

  describe( 'error handling (root workflow)', () => {
    it( 'rethrows error from fn and rejects with same message', async () => {
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( {
        name: 'err_wf',
        description: 'Error',
        inputSchema: z.object( {} ),
        outputSchema: z.object( {} ),
        fn: async () => {
          throw new Error( 'workflow failed' );
        }
      } );

      await expect( wf( {} ) ).rejects.toThrow( 'workflow failed' );
    } );
  } );
} );
