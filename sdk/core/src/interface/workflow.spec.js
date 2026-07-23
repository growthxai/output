import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  ACTIVITY_GET_TRACE_DESTINATIONS,
  INVOKE_ACTIVITY_SYMBOL
} from '#consts';
import { ValidationError } from '#errors';

const inWorkflowContextMock = vi.hoisted( () => vi.fn() );
const proxyActivitiesMock = vi.hoisted( () => vi.fn() );
const executeChildMock = vi.hoisted( () => vi.fn() );
const workflowInfoMock = vi.hoisted( () => vi.fn() );
const upsertMemoMock = vi.hoisted( () => vi.fn() );
const continueAsNewMock = vi.hoisted( () => vi.fn() );
const validateDefinitionMock = vi.hoisted( () => vi.fn() );
const validateInputMock = vi.hoisted( () => vi.fn() );
const validateOutputMock = vi.hoisted( () => vi.fn() );
const validateInvocationOptionsMock = vi.hoisted( () => vi.fn() );
const validatorConstructorMock = vi.hoisted( () => vi.fn() );
const createWorkflowMock = vi.hoisted( () => vi.fn( ( { handler } ) => handler ) );

vi.mock( './validations/index.js', () => {
  class WorkflowValidator {
    static validateDefinition( ...args ) {
      return validateDefinitionMock( ...args );
    }

    constructor( ...args ) {
      validatorConstructorMock( ...args );
      this.validateInput = validateInputMock;
      this.validateOutput = validateOutputMock;
      this.validateInvocationOptions = validateInvocationOptionsMock;
    }
  }

  return { WorkflowValidator };
} );

vi.mock( '#helpers/component', () => ( {
  createWorkflow: createWorkflowMock
} ) );

vi.mock( '@temporalio/workflow', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    inWorkflowContext: inWorkflowContextMock,
    proxyActivities: proxyActivitiesMock,
    executeChild: executeChildMock,
    workflowInfo: workflowInfoMock,
    upsertMemo: upsertMemoMock,
    continueAsNew: continueAsNewMock,
    uuid4: () => '550e8400e29b41d4a716446655440000'
  };
} );

const baseWorkflowInfo = () => ( {
  workflowId: 'workflow-123',
  workflowType: 'test_wf',
  runId: 'run-123',
  startTime: new Date( '2025-01-01T00:00:00.000Z' ),
  memo: {},
  continueAsNewSuggested: false
} );

const setWorkflowInfo = overrides => {
  const info = {
    ...baseWorkflowInfo(),
    ...overrides,
    memo: overrides?.memo ?? {}
  };
  workflowInfoMock.mockImplementation( () => info );
  return info;
};

const createActivities = handlers => new Proxy( {}, {
  get: ( _, prop ) => typeof prop === 'string' ?
    handlers[prop] ?? vi.fn().mockResolvedValue( undefined ) :
    undefined
} );

const mockActivities = handlers => {
  const activities = createActivities( handlers );
  proxyActivitiesMock.mockReturnValue( activities );
  return activities;
};

const installGlobalDispatcher = runId => {
  const dispatcher = vi.fn();
  dispatcher.runId = runId;
  globalThis[INVOKE_ACTIVITY_SYMBOL] = dispatcher;
  return dispatcher;
};

const workflowDefinition = overrides => ( {
  name: 'test_wf',
  description: 'Test workflow',
  inputSchema: z.object( {} ),
  outputSchema: z.object( {} ),
  fn: async () => ( {} ),
  ...overrides
} );

describe( 'workflow()', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    delete globalThis[INVOKE_ACTIVITY_SYMBOL];
    inWorkflowContextMock.mockReturnValue( true );
    executeChildMock.mockResolvedValue( {} );
    setWorkflowInfo();
    mockActivities( {
      [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( { local: '/tmp/trace' } )
    } );
  } );

  it( 'validates workflow definition at creation time', async () => {
    const { workflow } = await import( './workflow.js' );
    const inputSchema = z.object( {} );
    const outputSchema = z.object( {} );
    const fn = async () => ( {} );
    const options = { activityOptions: { retry: { maximumAttempts: 1 } } };

    workflow( {
      name: 'definition_wf',
      description: 'Definition workflow',
      inputSchema,
      outputSchema,
      fn,
      options,
      aliases: [ 'old_definition_wf' ]
    } );

    expect( validateDefinitionMock ).toHaveBeenCalledWith( {
      name: 'definition_wf',
      description: 'Definition workflow',
      inputSchema,
      outputSchema,
      fn,
      options,
      aliases: [ 'old_definition_wf' ]
    } );
    expect( validatorConstructorMock ).toHaveBeenCalledWith( {
      name: 'definition_wf',
      inputSchema,
      outputSchema
    } );
  } );

  it( 'propagates definition validation errors', async () => {
    const { workflow } = await import( './workflow.js' );
    const error = new ValidationError( 'invalid definition' );
    validateDefinitionMock.mockImplementationOnce( () => {
      throw error;
    } );

    expect( () => workflow( workflowDefinition( { name: 'invalid_name' } ) ) ).toThrow( error );
  } );

  it( 'creates a workflow component with definition metadata', async () => {
    const { workflow } = await import( './workflow.js' );
    const inputSchema = z.object( { value: z.string() } );
    const outputSchema = z.object( { ok: z.boolean() } );

    const wf = workflow( workflowDefinition( {
      name: 'metadata_wf',
      description: 'Metadata workflow',
      inputSchema,
      outputSchema,
      aliases: [ 'metadata_alias' ],
      fn: async () => ( { ok: true } )
    } ) );

    expect( createWorkflowMock ).toHaveBeenCalledWith( {
      name: 'metadata_wf',
      description: 'Metadata workflow',
      inputSchema,
      outputSchema,
      options: {},
      aliases: [ 'metadata_alias' ],
      handler: expect.any( Function )
    } );
    expect( wf ).toBe( createWorkflowMock.mock.calls[0][0].handler );
  } );

  describe( 'outside Temporal workflow context', () => {
    beforeEach( () => {
      inWorkflowContextMock.mockReturnValue( false );
    } );

    it( 'runs as a plain function with real test WorkflowContext and merged extra context', async () => {
      const { workflow } = await import( './workflow.js' );

      const wf = workflow( workflowDefinition( {
        name: 'plain_wf',
        inputSchema: z.object( { suffix: z.string() } ),
        outputSchema: z.object( { value: z.string(), extra: z.string() } ),
        fn: async ( input, context ) => ( {
          value: `${context.info.workflowId}${input.suffix}`,
          extra: context.extra
        } )
      } ) );

      await expect( wf( { suffix: '-ok' }, { context: { extra: 'custom' } } ) ).resolves.toEqual( {
        value: 'test-workflow-ok',
        extra: 'custom'
      } );
      expect( validateInvocationOptionsMock ).toHaveBeenCalledWith( { context: { extra: 'custom' } } );
      expect( validateInputMock ).toHaveBeenCalledWith( { suffix: '-ok' } );
      expect( validateOutputMock ).toHaveBeenCalledWith( { value: 'test-workflow-ok', extra: 'custom' } );
      expect( workflowInfoMock ).not.toHaveBeenCalled();
      expect( proxyActivitiesMock ).not.toHaveBeenCalled();
    } );

    it( 'does not run fn when plain function input validation fails', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new ValidationError( 'invalid input' );
      validateInputMock.mockImplementationOnce( () => {
        throw error;
      } );
      const fn = vi.fn();

      const wf = workflow( workflowDefinition( {
        name: 'plain_validation_wf',
        inputSchema: z.object( { value: z.string() } ),
        outputSchema: z.object( { result: z.string() } ),
        fn
      } ) );

      await expect( wf( { value: 1 } ) ).rejects.toBe( error );
      expect( fn ).not.toHaveBeenCalled();
      expect( validateOutputMock ).not.toHaveBeenCalled();
    } );

    it( 'propagates plain function output validation errors after fn runs', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new ValidationError( 'invalid output' );
      validateOutputMock.mockImplementationOnce( () => {
        throw error;
      } );
      const output = { result: 1 };
      const fn = vi.fn().mockResolvedValue( output );

      const wf = workflow( workflowDefinition( {
        name: 'plain_output_validation_wf',
        inputSchema: z.object( { value: z.string() } ),
        outputSchema: z.object( { result: z.string() } ),
        fn
      } ) );

      await expect( wf( { value: 'ok' } ) ).rejects.toBe( error );
      expect( fn ).toHaveBeenCalledWith( { value: 'ok' }, expect.objectContaining( {
        info: { workflowId: 'test-workflow', runId: 'test-run' }
      } ) );
      expect( validateOutputMock ).toHaveBeenCalledWith( output );
    } );
  } );

  describe( 'child workflow trigger path', () => {
    it( 'starts a child workflow and forwards child-safe invocation options', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ParentClosePolicy } = await import( '@temporalio/workflow' );
      installGlobalDispatcher( 'run-123' );
      const memo = {
        traceInfo: { workflowId: 'root-workflow' },
        parentActivityOptions: {
          heartbeatTimeout: '30s',
          retry: {
            maximumInterval: '20s',
            maximumAttempts: 4
          }
        }
      };
      setWorkflowInfo( { memo } );
      executeChildMock.mockResolvedValueOnce( { child: 'ok' } );

      const wf = workflow( workflowDefinition( {
        name: 'child_target_wf',
        inputSchema: z.object( { id: z.number() } ),
        outputSchema: z.object( { child: z.string() } ),
        fn: vi.fn()
      } ) );

      await expect( wf( { id: 1 }, {
        detached: true,
        context: { testOnly: true },
        activityOptions: {
          startToCloseTimeout: '2m',
          retry: { maximumAttempts: 7 }
        }
      } ) ).resolves.toEqual( { child: 'ok' } );
      expect( validateInvocationOptionsMock ).toHaveBeenCalledWith( {
        detached: true,
        context: { testOnly: true },
        activityOptions: {
          startToCloseTimeout: '2m',
          retry: { maximumAttempts: 7 }
        }
      } );

      expect( executeChildMock ).toHaveBeenCalledWith( 'child_target_wf', {
        args: [ {
          id: 1
        }, {
          activityOptions: {
            startToCloseTimeout: '2m',
            retry: { maximumAttempts: 7 }
          }
        } ],
        workflowId: expect.stringMatching( /^workflow-123-/ ),
        parentClosePolicy: ParentClosePolicy.ABANDON,
        memo
      } );
      expect( executeChildMock.mock.calls[0][1].args[1] ).not.toHaveProperty( 'detached' );
      expect( executeChildMock.mock.calls[0][1].args[1] ).not.toHaveProperty( 'context' );
      expect( proxyActivitiesMock ).not.toHaveBeenCalled();
    } );

    it( 'uses undefined input and terminate policy by default for child workflow execution', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ParentClosePolicy } = await import( '@temporalio/workflow' );
      installGlobalDispatcher( 'run-123' );
      setWorkflowInfo( { memo: { traceInfo: { workflowId: 'root-workflow' } } } );
      executeChildMock.mockResolvedValueOnce( 'done' );

      const wf = workflow( workflowDefinition( {
        name: 'no_input_child_wf',
        inputSchema: undefined,
        outputSchema: z.string(),
        fn: vi.fn()
      } ) );

      await expect( wf() ).resolves.toBe( 'done' );
      expect( executeChildMock ).toHaveBeenCalledWith( 'no_input_child_wf', expect.objectContaining( {
        args: [ undefined, { activityOptions: undefined } ],
        parentClosePolicy: ParentClosePolicy.TERMINATE,
        memo: { traceInfo: { workflowId: 'root-workflow' } }
      } ) );
    } );

    it( 'propagates executeChild errors without root ApplicationFailure wrapping', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new Error( 'child failed' );
      installGlobalDispatcher( 'run-123' );
      executeChildMock.mockRejectedValueOnce( error );

      const wf = workflow( workflowDefinition( { name: 'failing_child_wf' } ) );

      await expect( wf( {} ) ).rejects.toBe( error );
    } );
  } );

  describe( 'workflow execution path', () => {
    it( 'records the payload version before invocation validation can fail', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new ValidationError( 'invalid invocation options' );
      validateInvocationOptionsMock.mockImplementationOnce( () => {
        throw error;
      } );
      const wf = workflow( workflowDefinition() );

      await expect( wf( {}, { invalid: true } ) ).rejects.toBe( error );

      expect( upsertMemoMock ).toHaveBeenCalledWith( { payloadVersion: '2' } );
      expect( workflowInfoMock ).not.toHaveBeenCalled();
    } );

    it( 'rejects a global activity dispatcher left by another workflow run', async () => {
      const { workflow } = await import( './workflow.js' );
      const fn = vi.fn().mockResolvedValue( {} );
      installGlobalDispatcher( 'stale-run' );
      setWorkflowInfo( { runId: 'current-run' } );

      const wf = workflow( workflowDefinition( {
        name: 'contamination_wf',
        fn
      } ) );

      await expect( wf( {} ) ).rejects.toThrow( /Contamination of the workflow Node global context/ );
      expect( executeChildMock ).not.toHaveBeenCalled();
      expect( proxyActivitiesMock ).not.toHaveBeenCalled();
      expect( fn ).not.toHaveBeenCalled();
    } );

    it( 'records the payload version, skips trace destinations when trace is disabled, and returns raw output', async () => {
      const { workflow } = await import( './workflow.js' );
      const getTraceDestinations = vi.fn().mockResolvedValue( { local: '/tmp/root-trace' } );
      const info = setWorkflowInfo( { workflowType: 'root_wf', memo: {} } );
      mockActivities( { [ACTIVITY_GET_TRACE_DESTINATIONS]: getTraceDestinations } );

      const wf = workflow( workflowDefinition( {
        name: 'root_wf',
        outputSchema: z.object( { ok: z.boolean() } ),
        options: {
          disableTrace: true,
          activityOptions: {
            startToCloseTimeout: '5m',
            retry: { maximumAttempts: 5 }
          }
        },
        fn: async ( _, context ) => ( { ok: context.info.workflowId === 'workflow-123' } )
      } ) );

      await expect( wf( {} ) ).resolves.toEqual( { ok: true } );
      expect( info.memo.traceInfo ).toBeUndefined();
      expect( info.memo.activityOptions ).toBeUndefined();
      expect( info.memo.parentActivityOptions ).toEqual( expect.objectContaining( {
        startToCloseTimeout: '5m',
        heartbeatTimeout: '5m',
        retry: expect.objectContaining( { maximumAttempts: 5 } )
      } ) );
      expect( proxyActivitiesMock ).toHaveBeenCalledWith( expect.objectContaining( {
        startToCloseTimeout: '5m',
        heartbeatTimeout: '5m',
        retry: expect.objectContaining( { maximumAttempts: 5 } )
      } ) );
      expect( getTraceDestinations ).not.toHaveBeenCalled();
      expect( upsertMemoMock ).toHaveBeenCalledOnce();
      expect( upsertMemoMock ).toHaveBeenCalledWith( { payloadVersion: '2' } );
    } );

    it( 'resolves activity options by invocation, definition, inherited memo, then default precedence', async () => {
      const { workflow } = await import( './workflow.js' );
      const info = setWorkflowInfo( {
        workflowType: 'activity_options_wf',
        memo: {
          parentActivityOptions: {
            heartbeatTimeout: '30s',
            retry: {
              maximumInterval: '30s',
              maximumAttempts: 4
            }
          }
        }
      } );

      const wf = workflow( workflowDefinition( {
        name: 'activity_options_wf',
        options: {
          activityOptions: {
            startToCloseTimeout: '5m',
            retry: {
              backoffCoefficient: 3,
              maximumAttempts: 2
            }
          }
        }
      } ) );

      await wf( {}, {
        activityOptions: {
          heartbeatTimeout: '1m',
          retry: {
            initialInterval: '1s',
            maximumAttempts: 9
          }
        }
      } );

      expect( proxyActivitiesMock ).toHaveBeenCalledWith( {
        startToCloseTimeout: '5m',
        heartbeatTimeout: '1m',
        retry: {
          initialInterval: '1s',
          backoffCoefficient: 3,
          maximumInterval: '30s',
          maximumAttempts: 9,
          nonRetryableErrorTypes: [ ValidationError.name, 'FatalError' ]
        }
      } );
      expect( info.memo.parentActivityOptions ).toEqual( proxyActivitiesMock.mock.calls[0][0] );
      expect( upsertMemoMock ).toHaveBeenNthCalledWith( 1, { payloadVersion: '2' } );
      expect( upsertMemoMock ).toHaveBeenNthCalledWith( 2, { trace: { local: '/tmp/trace' } } );
    } );

    it( 'runs non-root workflow execution without rebuilding trace info or fetching trace destinations', async () => {
      const { workflow } = await import( './workflow.js' );
      const getTraceDestinations = vi.fn().mockResolvedValue( { local: '/tmp/trace' } );
      const memo = {
        traceInfo: { workflowId: 'root-workflow' },
        parentActivityOptions: {
          startToCloseTimeout: '9m',
          retry: { maximumAttempts: 8 }
        }
      };
      mockActivities( { [ACTIVITY_GET_TRACE_DESTINATIONS]: getTraceDestinations } );
      const info = setWorkflowInfo( {
        workflowId: 'child-workflow',
        root: { workflowId: 'root-workflow', runId: 'root-run' },
        memo
      } );

      const wf = workflow( workflowDefinition( {
        name: 'nested_wf',
        options: {
          activityOptions: {
            startToCloseTimeout: '1m',
            retry: { maximumAttempts: 2 }
          }
        },
        outputSchema: z.object( { ok: z.boolean() } ),
        fn: async () => ( { ok: true } )
      } ) );

      await expect( wf( {} ) ).resolves.toEqual( { ok: true } );
      expect( info.memo.traceInfo ).toBe( memo.traceInfo );
      expect( info.memo.activityOptions ).toBeUndefined();
      expect( info.memo.parentActivityOptions ).toEqual( expect.objectContaining( {
        startToCloseTimeout: '1m',
        heartbeatTimeout: '5m',
        retry: expect.objectContaining( { maximumAttempts: 2 } )
      } ) );
      expect( proxyActivitiesMock ).toHaveBeenCalledWith( expect.objectContaining( {
        startToCloseTimeout: '1m',
        heartbeatTimeout: '5m',
        retry: expect.objectContaining( { maximumAttempts: 2 } )
      } ) );
      expect( getTraceDestinations ).not.toHaveBeenCalled();
      expect( upsertMemoMock ).toHaveBeenCalledOnce();
      expect( upsertMemoMock ).toHaveBeenCalledWith( { payloadVersion: '2' } );
    } );

    it( 'stores empty trace destinations in memo and returns raw output', async () => {
      const { workflow } = await import( './workflow.js' );
      setWorkflowInfo( { workflowType: 'no_trace_dest_wf' } );
      mockActivities( { [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( {} ) } );

      const wf = workflow( workflowDefinition( {
        name: 'no_trace_dest_wf',
        outputSchema: z.object( { ok: z.boolean() } ),
        fn: async () => ( { ok: true } )
      } ) );

      await expect( wf( {} ) ).resolves.toEqual( { ok: true } );
      expect( upsertMemoMock ).toHaveBeenNthCalledWith( 1, { payloadVersion: '2' } );
      expect( upsertMemoMock ).toHaveBeenNthCalledWith( 2, { trace: {} } );
    } );

    it( 'validates input and output inside workflow context', async () => {
      const { workflow } = await import( './workflow.js' );
      const inputError = new ValidationError( 'invalid workflow input' );
      const outputError = new ValidationError( 'invalid workflow output' );
      setWorkflowInfo( { workflowType: 'runtime_validation_wf' } );

      const wf = workflow( workflowDefinition( {
        name: 'runtime_validation_wf',
        inputSchema: z.object( { value: z.string() } ),
        outputSchema: z.object( { result: z.string() } ),
        fn: async () => ( { result: 1 } )
      } ) );

      validateInputMock.mockImplementationOnce( () => {
        throw inputError;
      } );
      await expect( wf( { value: 1 } ) ).rejects.toBe( inputError );
      expect( upsertMemoMock ).toHaveBeenCalledWith( { trace: { local: '/tmp/trace' } } );

      delete globalThis[INVOKE_ACTIVITY_SYMBOL];
      setWorkflowInfo( { workflowType: 'runtime_validation_wf', memo: {} } );
      upsertMemoMock.mockClear();
      validateOutputMock.mockImplementationOnce( () => {
        throw outputError;
      } );
      await expect( wf( { value: 'ok' } ) ).rejects.toBe( outputError );
      expect( upsertMemoMock ).toHaveBeenCalledWith( { trace: { local: '/tmp/trace' } } );
    } );
  } );

  describe( 'activity dispatchers', () => {
    it( 'invokes workflow-scoped activities and returns their raw outputs', async () => {
      const { workflow } = await import( './workflow.js' );
      setWorkflowInfo( { workflowType: 'dispatch_wf' } );
      const step = vi.fn().mockResolvedValue( 'step-output' );
      const evaluator = vi.fn().mockResolvedValue( 'eval-output' );
      mockActivities( {
        [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( {} ),
        'dispatch_wf#stepA': step,
        'dispatch_wf#evalA': evaluator
      } );

      const wf = workflow( workflowDefinition( {
        name: 'dispatch_wf',
        outputSchema: z.object( { stepResult: z.string(), evalResult: z.string() } ),
        fn: async () => {
          return {
            stepResult: await globalThis[INVOKE_ACTIVITY_SYMBOL]( 'stepA', { a: 1 }, { b: 2 } ),
            evalResult: await globalThis[INVOKE_ACTIVITY_SYMBOL]( 'evalA', { c: 3 } )
          };
        }
      } ) );

      await expect( wf( {} ) ).resolves.toEqual( { stepResult: 'step-output', evalResult: 'eval-output' } );
      expect( step ).toHaveBeenCalledWith( { a: 1 }, { b: 2 } );
      expect( evaluator ).toHaveBeenCalledWith( { c: 3 } );
    } );

    it( 'invokes shared activities through the workflow namespace', async () => {
      const { workflow } = await import( './workflow.js' );
      setWorkflowInfo( { workflowType: 'shared_dispatch_wf' } );
      const sharedStep = vi.fn().mockResolvedValue( 'shared-step-output' );
      const sharedEvaluator = vi.fn().mockResolvedValue( 'shared-eval-output' );
      mockActivities( {
        [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( {} ),
        'shared_dispatch_wf#stepA': sharedStep,
        'shared_dispatch_wf#evalA': sharedEvaluator
      } );

      const wf = workflow( workflowDefinition( {
        name: 'shared_dispatch_wf',
        outputSchema: z.object( { stepResult: z.string(), evalResult: z.string() } ),
        fn: async () => {
          return {
            stepResult: await globalThis[INVOKE_ACTIVITY_SYMBOL]( 'stepA' ),
            evalResult: await globalThis[INVOKE_ACTIVITY_SYMBOL]( 'evalA', { x: 1 } )
          };
        }
      } ) );

      await expect( wf( {} ) ).resolves.toEqual( {
        stepResult: 'shared-step-output',
        evalResult: 'shared-eval-output'
      } );
      expect( sharedStep ).toHaveBeenCalledWith();
      expect( sharedEvaluator ).toHaveBeenCalledWith( { x: 1 } );
    } );
  } );

  describe( 'error handling', () => {
    it( 'stores root trace destinations in memo and preserves workflow errors', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new Error( 'root failed with details' );
      error.details = [ { domain: { reason: 'bad-input' } } ];
      setWorkflowInfo( { workflowType: 'root_error_wf' } );

      const wf = workflow( workflowDefinition( {
        name: 'root_error_wf',
        fn: async () => {
          throw error;
        }
      } ) );

      const thrown = await wf( {} ).catch( e => e );
      expect( thrown ).toBe( error );
      expect( error.details ).toEqual( [ { domain: { reason: 'bad-input' } } ] );
      expect( upsertMemoMock ).toHaveBeenCalledWith( { trace: { local: '/tmp/trace' } } );
    } );

    it( 'preserves existing root ApplicationFailure metadata', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ApplicationFailure } = await import( '@temporalio/workflow' );
      setWorkflowInfo( { workflowType: 'root_application_failure_wf' } );
      const error = ApplicationFailure.create( {
        message: 'root application failed',
        type: 'OriginalType',
        nonRetryable: true,
        details: [ { domain: { reason: 'bad-input' } } ]
      } );

      const wf = workflow( workflowDefinition( {
        name: 'root_application_failure_wf',
        fn: async () => {
          throw error;
        }
      } ) );

      const thrown = await wf( {} ).catch( e => e );

      expect( thrown ).toBe( error );
      expect( error.type ).toBe( 'OriginalType' );
      expect( error.details ).toEqual( [ { domain: { reason: 'bad-input' } } ] );
      expect( upsertMemoMock ).toHaveBeenCalledWith( { trace: { local: '/tmp/trace' } } );
    } );

    it( 'rethrows non-root workflow errors without ApplicationFailure wrapping', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new Error( 'nested failed' );
      setWorkflowInfo( {
        workflowId: 'nested-workflow',
        root: { workflowId: 'root-workflow', runId: 'root-run' },
        memo: { traceInfo: { workflowId: 'root-workflow' } }
      } );

      const wf = workflow( workflowDefinition( {
        name: 'nested_error_wf',
        fn: async () => {
          throw error;
        }
      } ) );

      await expect( wf( {} ) ).rejects.toBe( error );
      expect( upsertMemoMock ).toHaveBeenCalledOnce();
      expect( upsertMemoMock ).toHaveBeenCalledWith( { payloadVersion: '2' } );
    } );
  } );
} );
