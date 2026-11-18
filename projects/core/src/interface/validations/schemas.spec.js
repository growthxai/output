import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { EvaluationResult } from '../evaluation_result.js';
import {
  evaluatorOutputSchema,
  evaluatorSchema,
  executeInParallelSchema,
  httpRequestSchema,
  isZodSchema,
  stepSchema,
  workflowInvocationOptionsSchema,
  workflowSchema
} from './schemas.js';

const fn = () => {};
const validBase = {
  name: 'valid_name',
  description: 'Valid description',
  inputSchema: z.object( { value: z.string() } ),
  outputSchema: z.object( { result: z.string() } ),
  fn,
  options: {
    activityOptions: {
      startToCloseTimeout: '5m',
      heartbeatTimeout: 1000,
      retry: {
        initialInterval: '10s',
        backoffCoefficient: 2,
        maximumInterval: '1m',
        maximumAttempts: 3,
        nonRetryableErrorTypes: [ 'FatalError' ]
      },
      priority: {
        fairnessKey: 'tenant',
        fairnessWeight: 1,
        priorityKey: 2
      },
      summary: 'Short summary'
    }
  }
};

describe( 'validation schemas', () => {
  describe( 'isZodSchema()', () => {
    it( 'identifies Zod schemas', () => {
      expect( isZodSchema( z.object( { name: z.string() } ) ) ).toBe( true );
      expect( isZodSchema( z.string() ) ).toBe( true );
      expect( isZodSchema( z.array( z.number() ) ) ).toBe( true );
      expect( isZodSchema( z.union( [ z.string(), z.number() ] ) ) ).toBe( true );
    } );

    it( 'uses the Zod v4 runtime shape instead of instanceof', () => {
      const schemaLikeFromAnotherPackageInstance = {
        _zod: {
          def: {
            type: 'object'
          }
        },
        safeParse: () => ( { success: true, data: {} } )
      };

      expect( isZodSchema( schemaLikeFromAnotherPackageInstance ) ).toBe( true );
    } );

    it( 'rejects non-Zod values', () => {
      expect( isZodSchema( { type: 'object' } ) ).toBe( false );
      expect( isZodSchema( {} ) ).toBe( false );
      expect( isZodSchema( [] ) ).toBe( false );
      expect( isZodSchema( null ) ).toBe( false );
      expect( isZodSchema( undefined ) ).toBe( false );
      expect( isZodSchema( 'string' ) ).toBe( false );
    } );

    it( 'rejects objects that only partially match the Zod shape', () => {
      expect( isZodSchema( { safeParse: () => ( { success: true } ) } ) ).toBe( false );
      expect( isZodSchema( { _zod: { def: { type: 'string' } } } ) ).toBe( false );
      expect( isZodSchema( { _zod: { def: {} }, safeParse: () => ( { success: true } ) } ) ).toBe( false );
      expect( isZodSchema( { _zod: null, safeParse: () => ( { success: true } ) } ) ).toBe( false );
    } );
  } );

  describe( 'stepSchema', () => {
    it( 'accepts a valid step definition', () => {
      expect( stepSchema.safeParse( validBase ).success ).toBe( true );
    } );

    it( 'rejects invalid names, non-Zod schemas, invalid activity options, and unknown top-level keys', () => {
      expect( stepSchema.safeParse( { ...validBase, name: 'invalid-name' } ).success ).toBe( false );
      expect( stepSchema.safeParse( { ...validBase, inputSchema: { type: 'object' } } ).success ).toBe( false );
      expect( stepSchema.safeParse( {
        ...validBase,
        options: { activityOptions: { retry: { maximumAttempts: 0 } } }
      } ).success ).toBe( false );
      expect( stepSchema.safeParse( { ...validBase, unexpected: true } ).success ).toBe( false );
    } );
  } );

  describe( 'workflowSchema', () => {
    it( 'accepts workflow-specific options and aliases', () => {
      const result = workflowSchema.safeParse( {
        ...validBase,
        aliases: [ 'old_name' ],
        options: {
          ...validBase.options,
          disableTrace: true
        }
      } );

      expect( result.success ).toBe( true );
    } );

    it( 'defaults aliases and rejects invalid workflow fields', () => {
      const result = workflowSchema.safeParse( validBase );
      expect( result.success && result.data.aliases ).toEqual( [] );

      expect( workflowSchema.safeParse( { ...validBase, aliases: [ 'bad-alias' ] } ).success ).toBe( false );
      expect( workflowSchema.safeParse( {
        ...validBase,
        options: { ...validBase.options, disableTrace: 'yes' }
      } ).success ).toBe( false );
    } );
  } );

  describe( 'evaluatorSchema and evaluatorOutputSchema', () => {
    it( 'accepts evaluator definitions without outputSchema', () => {
      const { outputSchema: _outputSchema, ...validEvaluator } = validBase;
      expect( evaluatorSchema.safeParse( validEvaluator ).success ).toBe( true );
    } );

    it( 'rejects evaluator definitions with outputSchema', () => {
      expect( evaluatorSchema.safeParse( validBase ).success ).toBe( false );
    } );

    it( 'accepts only EvaluationResult instances as evaluator output', () => {
      expect( evaluatorOutputSchema.safeParse( new EvaluationResult( { value: 'ok', confidence: 1 } ) ).success ).toBe( true );
      expect( evaluatorOutputSchema.safeParse( { value: 'ok', confidence: 1 } ).success ).toBe( false );
    } );
  } );

  describe( 'httpRequestSchema', () => {
    it( 'accepts valid HTTP request payloads', () => {
      expect( httpRequestSchema.safeParse( {
        url: 'https://example.com',
        method: 'POST',
        payload: { ok: true },
        headers: { authorization: 'Bearer token' },
        responseOptions: { includeHeaders: true, includeBody: true }
      } ).success ).toBe( true );
    } );

    it( 'defaults omitted response options to false', () => {
      const result = httpRequestSchema.safeParse( {
        url: 'https://example.com',
        method: 'GET',
        responseOptions: {}
      } );

      expect( result.success ).toBe( true );
      expect( result.data.responseOptions ).toEqual( {
        includeHeaders: false,
        includeBody: false
      } );
    } );

    it( 'rejects invalid URL protocols, methods, header values, and response options', () => {
      expect( httpRequestSchema.safeParse( { url: 'ftp://example.com', method: 'GET' } ).success ).toBe( false );
      expect( httpRequestSchema.safeParse( { url: 'https://example.com', method: 'OPTIONS' } ).success ).toBe( false );
      expect( httpRequestSchema.safeParse( {
        url: 'https://example.com',
        method: 'GET',
        headers: { count: 1 }
      } ).success ).toBe( false );
      expect( httpRequestSchema.safeParse( {
        url: 'https://example.com',
        method: 'GET',
        responseOptions: { includeBody: 'yes' }
      } ).success ).toBe( false );
    } );
  } );

  describe( 'workflowInvocationOptionsSchema', () => {
    it( 'accepts omitted options and valid invocation configuration', () => {
      expect( workflowInvocationOptionsSchema.safeParse( undefined ).success ).toBe( true );
      expect( workflowInvocationOptionsSchema.safeParse( {
        detached: true,
        activityOptions: { retry: { maximumAttempts: 1 } },
        context: {
          control: {
            continueAsNew: fn,
            isContinueAsNewSuggested: fn,
            extraControl: true
          },
          info: {
            workflowId: 'wf',
            runId: 'run',
            extraInfo: true
          },
          extraContext: true
        }
      } ).success ).toBe( true );
    } );

    it( 'rejects stale option shapes and invalid invocation values', () => {
      expect( workflowInvocationOptionsSchema.safeParse( {
        options: { activityOptions: { retry: { maximumAttempts: 1 } } }
      } ).success ).toBe( false );
      expect( workflowInvocationOptionsSchema.safeParse( { detached: 'true' } ).success ).toBe( false );
      expect( workflowInvocationOptionsSchema.safeParse( {
        activityOptions: { retry: { maximumAttempts: 0 } }
      } ).success ).toBe( false );
      expect( workflowInvocationOptionsSchema.safeParse( {
        context: { control: { continueAsNew: 'nope' } }
      } ).success ).toBe( false );
    } );
  } );

  describe( 'executeInParallelSchema', () => {
    it( 'accepts valid execution configs', () => {
      expect( executeInParallelSchema.safeParse( { jobs: [ fn ], concurrency: 1 } ).success ).toBe( true );
      expect( executeInParallelSchema.safeParse( { jobs: [ fn ], concurrency: Infinity, onJobCompleted: fn } ).success ).toBe( true );
    } );

    it( 'rejects invalid execution configs', () => {
      expect( executeInParallelSchema.safeParse( { jobs: [], concurrency: 0 } ).success ).toBe( false );
      expect( executeInParallelSchema.safeParse( { jobs: [ 'not-a-function' ], concurrency: 1 } ).success ).toBe( false );
      expect( executeInParallelSchema.safeParse( { jobs: [ fn ], concurrency: 1, onJobCompleted: 'nope' } ).success ).toBe( false );
    } );
  } );
} );
