import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { ACTIVITY_GET_TRACE_DESTINATIONS, METADATA_ACCESS_SYMBOL, SHARED_STEP_PREFIX, WORKFLOW_WRAPPER_VERSION_FIELD } from '#consts';
import { ValidationError } from '#errors';

const inWorkflowContextMock = vi.hoisted( () => vi.fn() );
const proxyActivitiesMock = vi.hoisted( () => vi.fn() );
const executeChildMock = vi.hoisted( () => vi.fn() );
const workflowInfoMock = vi.hoisted( () => vi.fn() );
const continueAsNewMock = vi.hoisted( () => vi.fn() );
const validateDefinitionMock = vi.hoisted( () => vi.fn() );
const validateInputMock = vi.hoisted( () => vi.fn() );
const validateOutputMock = vi.hoisted( () => vi.fn() );
const validateInvocationOptionsMock = vi.hoisted( () => vi.fn() );
const validatorConstructorMock = vi.hoisted( () => vi.fn() );

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

vi.mock( '@temporalio/workflow', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    inWorkflowContext: inWorkflowContextMock,
    proxyActivities: proxyActivitiesMock,
    executeChild: executeChildMock,
    workflowInfo: workflowInfoMock,
    continueAsNew: continueAsNewMock,
    uuid4: () => '550e8400e29b41d4a716446655440000'
  };
} );

const baseWorkflowInfo = () => ( {
  workflowId: 'workflow-123',
  workflowType: 'test_workflow',
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
    handlers[prop] ?? vi.fn().mockResolvedValue( { output: undefined } ) :
    undefined
} );

const mockActivities = handlers => {
  const activities = createActivities( handlers );
  proxyActivitiesMock.mockReturnValue( activities );
  return activities;
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
    inWorkflowContextMock.mockReturnValue( true );
    executeChildMock.mockResolvedValue( { output: {} } );
    setWorkflowInfo();
    mockActivities( {
      [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( { output: { local: '/tmp/trace' } } )
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

  it( 'attaches workflow metadata to the wrapper', async () => {
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

    const [ metadataSymbol ] = Object.getOwnPropertySymbols( wf );
    expect( wf[metadataSymbol] ).toEqual( {
      name: 'metadata_wf',
      description: 'Metadata workflow',
      inputSchema,
      outputSchema,
      aliases: [ 'metadata_alias' ]
    } );
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
    it( 'starts a child workflow when memo.stack already contains the current workflowId', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ParentClosePolicy } = await import( '@temporalio/workflow' );
      const memo = {
        stack: [ 'root-workflow', 'workflow-123' ],
        traceInfo: { workflowId: 'root-workflow' },
        activityOptions: {
          startToCloseTimeout: '10m',
          retry: { maximumAttempts: 2 }
        }
      };
      setWorkflowInfo( { memo } );
      executeChildMock.mockResolvedValueOnce( { output: { child: 'ok' } } );

      const wf = workflow( workflowDefinition( {
        name: 'child_target_wf',
        inputSchema: z.object( { id: z.number() } ),
        outputSchema: z.object( { child: z.string() } ),
        fn: vi.fn()
      } ) );

      await expect( wf( { id: 1 }, {
        detached: true,
        activityOptions: {
          startToCloseTimeout: '2m',
          retry: { maximumAttempts: 7 }
        }
      } ) ).resolves.toEqual( { child: 'ok' } );
      expect( validateInvocationOptionsMock ).toHaveBeenCalledWith( {
        detached: true,
        activityOptions: {
          startToCloseTimeout: '2m',
          retry: { maximumAttempts: 7 }
        }
      } );

      expect( executeChildMock ).toHaveBeenCalledWith( 'child_target_wf', {
        args: [ { id: 1 } ],
        workflowId: expect.stringMatching( /^workflow-123-/ ),
        parentClosePolicy: ParentClosePolicy.ABANDON,
        memo: {
          stack: [ 'root-workflow', 'workflow-123' ],
          traceInfo: { workflowId: 'root-workflow' },
          activityOptions: {
            startToCloseTimeout: '2m',
            retry: { maximumAttempts: 7 }
          }
        }
      } );
      expect( proxyActivitiesMock ).not.toHaveBeenCalled();
    } );

    it( 'uses empty args and terminate policy by default for child workflow execution', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ParentClosePolicy } = await import( '@temporalio/workflow' );
      setWorkflowInfo( { memo: { stack: [ 'workflow-123' ], activityOptions: { heartbeatTimeout: '1m' } } } );
      executeChildMock.mockResolvedValueOnce( { output: 'done' } );

      const wf = workflow( workflowDefinition( {
        name: 'no_input_child_wf',
        inputSchema: undefined,
        outputSchema: z.string(),
        fn: vi.fn()
      } ) );

      await expect( wf() ).resolves.toBe( 'done' );
      expect( executeChildMock ).toHaveBeenCalledWith( 'no_input_child_wf', expect.objectContaining( {
        args: [],
        parentClosePolicy: ParentClosePolicy.TERMINATE,
        memo: { stack: [ 'workflow-123' ], activityOptions: { heartbeatTimeout: '1m' } }
      } ) );
    } );

    it( 'propagates executeChild errors without root ApplicationFailure wrapping', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new Error( 'child failed' );
      setWorkflowInfo( { memo: { stack: [ 'workflow-123' ] } } );
      executeChildMock.mockRejectedValueOnce( error );

      const wf = workflow( workflowDefinition( { name: 'failing_child_wf' } ) );

      await expect( wf( {} ) ).rejects.toBe( error );
    } );
  } );

  describe( 'workflow execution path', () => {
    it( 'initializes root memo, gets trace destinations, validates output, and returns an envelope', async () => {
      const { workflow } = await import( './workflow.js' );
      const getTraceDestinations = vi.fn().mockResolvedValue( { output: { local: '/tmp/root-trace' } } );
      const info = setWorkflowInfo( { memo: {} } );
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

      await expect( wf( {} ) ).resolves.toEqual( {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        output: { ok: true },
        trace: { destinations: { local: '/tmp/root-trace' } }
      } );
      expect( info.memo.stack ).toEqual( [ 'workflow-123' ] );
      expect( info.memo.traceInfo ).toEqual( {
        workflowId: 'workflow-123',
        workflowType: 'test_workflow',
        runId: 'run-123',
        startTime: new Date( '2025-01-01T00:00:00.000Z' ).getTime(),
        disableTrace: true
      } );
      expect( info.memo.activityOptions ).toEqual( expect.objectContaining( {
        startToCloseTimeout: '5m',
        heartbeatTimeout: '5m',
        retry: expect.objectContaining( { maximumAttempts: 5 } )
      } ) );
      expect( proxyActivitiesMock ).toHaveBeenCalledWith( info.memo.activityOptions );
      expect( getTraceDestinations ).toHaveBeenCalledWith( info.memo.traceInfo );
    } );

    it( 'runs non-root workflow execution without rebuilding trace info or fetching trace destinations', async () => {
      const { workflow } = await import( './workflow.js' );
      const getTraceDestinations = vi.fn().mockResolvedValue( { output: { local: '/tmp/trace' } } );
      const memo = {
        stack: [ 'root-workflow' ],
        traceInfo: { workflowId: 'root-workflow' },
        activityOptions: {
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

      await expect( wf( {} ) ).resolves.toEqual( {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        output: { ok: true }
      } );
      expect( info.memo.stack ).toEqual( [ 'root-workflow', 'child-workflow' ] );
      expect( info.memo.traceInfo ).toBe( memo.traceInfo );
      expect( info.memo.activityOptions ).toEqual( expect.objectContaining( {
        startToCloseTimeout: '9m',
        retry: expect.objectContaining( { maximumAttempts: 8 } )
      } ) );
      expect( proxyActivitiesMock ).toHaveBeenCalledWith( info.memo.activityOptions );
      expect( getTraceDestinations ).not.toHaveBeenCalled();
    } );

    it( 'omits trace from the root result when getTraceDestinations returns no destinations', async () => {
      const { workflow } = await import( './workflow.js' );
      mockActivities( { [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( { output: null } ) } );

      const wf = workflow( workflowDefinition( {
        name: 'no_trace_dest_wf',
        outputSchema: z.object( { ok: z.boolean() } ),
        fn: async () => ( { ok: true } )
      } ) );

      await expect( wf( {} ) ).resolves.toEqual( {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        output: { ok: true }
      } );
    } );

    it( 'validates input and output inside workflow context', async () => {
      const { workflow } = await import( './workflow.js' );
      const inputError = new ValidationError( 'invalid workflow input' );
      const outputError = new ValidationError( 'invalid workflow output' );

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
      expect( inputError[METADATA_ACCESS_SYMBOL] ).toEqual( { trace: { destinations: { local: '/tmp/trace' } } } );

      setWorkflowInfo( { memo: {} } );
      validateOutputMock.mockImplementationOnce( () => {
        throw outputError;
      } );
      await expect( wf( { value: 'ok' } ) ).rejects.toBe( outputError );
      expect( outputError[METADATA_ACCESS_SYMBOL] ).toEqual( { trace: { destinations: { local: '/tmp/trace' } } } );
    } );
  } );

  describe( 'activity dispatchers', () => {
    it( 'invokes workflow-scoped steps and evaluators and unwraps activity output', async () => {
      const { workflow } = await import( './workflow.js' );
      const step = vi.fn().mockResolvedValue( { output: 'step-output' } );
      const evaluator = vi.fn().mockResolvedValue( { output: 'eval-output' } );
      mockActivities( {
        [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( { output: null } ),
        'dispatch_wf#stepA': step,
        'dispatch_wf#evalA': evaluator
      } );

      const wf = workflow( workflowDefinition( {
        name: 'dispatch_wf',
        outputSchema: z.object( { stepResult: z.string(), evalResult: z.string() } ),
        async fn() {
          return {
            stepResult: await this.invokeStep( 'stepA', { a: 1 }, { b: 2 } ),
            evalResult: await this.invokeEvaluator( 'evalA', { c: 3 } )
          };
        }
      } ) );

      await expect( wf( {} ) ).resolves.toEqual( {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        output: { stepResult: 'step-output', evalResult: 'eval-output' }
      } );
      expect( step ).toHaveBeenCalledWith( { a: 1 }, { b: 2 } );
      expect( evaluator ).toHaveBeenCalledWith( { c: 3 } );
    } );

    it( 'invokes shared steps and shared evaluators with the shared prefix', async () => {
      const { workflow } = await import( './workflow.js' );
      const sharedStep = vi.fn().mockResolvedValue( { output: 'shared-step-output' } );
      const sharedEvaluator = vi.fn().mockResolvedValue( { output: 'shared-eval-output' } );
      mockActivities( {
        [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( { output: null } ),
        [`${SHARED_STEP_PREFIX}#stepA`]: sharedStep,
        [`${SHARED_STEP_PREFIX}#evalA`]: sharedEvaluator
      } );

      const wf = workflow( workflowDefinition( {
        name: 'shared_dispatch_wf',
        outputSchema: z.object( { stepResult: z.string(), evalResult: z.string() } ),
        async fn() {
          return {
            stepResult: await this.invokeSharedStep( 'stepA' ),
            evalResult: await this.invokeSharedEvaluator( 'evalA', { x: 1 } )
          };
        }
      } ) );

      await expect( wf( {} ) ).resolves.toEqual( {
        [WORKFLOW_WRAPPER_VERSION_FIELD]: 1,
        output: { stepResult: 'shared-step-output', evalResult: 'shared-eval-output' }
      } );
      expect( sharedStep ).toHaveBeenCalledWith();
      expect( sharedEvaluator ).toHaveBeenCalledWith( { x: 1 } );
    } );
  } );

  describe( 'error handling', () => {
    it( 'attaches root trace destinations to root workflow errors before rethrowing', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new Error( 'root failed' );

      const wf = workflow( workflowDefinition( {
        name: 'root_error_wf',
        fn: async () => {
          throw error;
        }
      } ) );

      const thrown = await wf( {} ).catch( e => e );
      expect( thrown ).toBe( error );
      expect( error[METADATA_ACCESS_SYMBOL] ).toEqual( { trace: { destinations: { local: '/tmp/trace' } } } );
    } );

    it( 'preserves existing error details when attaching root trace metadata', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new Error( 'root failed with details' );
      error.details = [ { domain: { reason: 'bad-input' } } ];

      const wf = workflow( workflowDefinition( {
        name: 'root_error_existing_details_wf',
        fn: async () => {
          throw error;
        }
      } ) );

      await expect( wf( {} ) ).rejects.toBe( error );
      expect( error.details ).toEqual( [ { domain: { reason: 'bad-input' } } ] );
      expect( error[METADATA_ACCESS_SYMBOL] ).toEqual( { trace: { destinations: { local: '/tmp/trace' } } } );
    } );

    it( 'rethrows root workflow errors without metadata when trace destinations are unavailable', async () => {
      const { workflow } = await import( './workflow.js' );
      mockActivities( { [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( { output: null } ) } );
      const error = new Error( 'root failed without trace' );

      const wf = workflow( workflowDefinition( {
        name: 'root_error_no_trace_wf',
        fn: async () => {
          throw error;
        }
      } ) );

      await expect( wf( {} ) ).rejects.toBe( error );
      expect( error[METADATA_ACCESS_SYMBOL] ).toBeUndefined();
    } );

    it( 'preserves existing error details when trace destinations are unavailable', async () => {
      const { workflow } = await import( './workflow.js' );
      mockActivities( { [ACTIVITY_GET_TRACE_DESTINATIONS]: vi.fn().mockResolvedValue( { output: null } ) } );
      const error = new Error( 'root failed without trace' );
      error.details = [ { domain: { reason: 'bad-input' } } ];

      const wf = workflow( workflowDefinition( {
        name: 'root_error_existing_details_no_trace_wf',
        fn: async () => {
          throw error;
        }
      } ) );

      await expect( wf( {} ) ).rejects.toBe( error );
      expect( error.details ).toEqual( [ { domain: { reason: 'bad-input' } } ] );
      expect( error[METADATA_ACCESS_SYMBOL] ).toBeUndefined();
    } );

    it( 'attaches trace metadata to existing root ApplicationFailure without wrapping it', async () => {
      const { workflow } = await import( './workflow.js' );
      const { ApplicationFailure } = await import( '@temporalio/workflow' );
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
      expect( error[METADATA_ACCESS_SYMBOL] ).toEqual( { trace: { destinations: { local: '/tmp/trace' } } } );
    } );

    it( 'rethrows non-root workflow errors without ApplicationFailure wrapping', async () => {
      const { workflow } = await import( './workflow.js' );
      const error = new Error( 'nested failed' );
      setWorkflowInfo( {
        workflowId: 'nested-workflow',
        root: { workflowId: 'root-workflow', runId: 'root-run' },
        memo: { stack: [ 'root-workflow' ], traceInfo: { workflowId: 'root-workflow' } }
      } );

      const wf = workflow( workflowDefinition( {
        name: 'nested_error_wf',
        fn: async () => {
          throw error;
        }
      } ) );

      await expect( wf( {} ) ).rejects.toBe( error );
      expect( error[METADATA_ACCESS_SYMBOL] ).toBeUndefined();
    } );
  } );
} );
