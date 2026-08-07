import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '#errors';
import { EvaluationResult } from '../evaluation_result.js';
import {
  EvaluatorValidator,
  StepValidator,
  WorkflowValidator,
  validateExecuteInParallel,
  validateRequestPayload
} from './index.js';

const fn = async () => {};

const workflowArgs = {
  name: 'valid_workflow',
  description: 'Valid workflow',
  inputSchema: z.object( { value: z.string() } ),
  outputSchema: z.object( { result: z.string() } ),
  fn,
  options: {
    activityOptions: {
      startToCloseTimeout: '5m',
      retry: { maximumAttempts: 2 }
    },
    disableTrace: true
  },
  aliases: [ 'old_workflow' ]
};

const stepArgs = {
  name: 'valid_step',
  description: 'Valid step',
  inputSchema: z.object( { value: z.string() } ),
  outputSchema: z.object( { result: z.string() } ),
  fn,
  options: {
    activityOptions: {
      heartbeatTimeout: '30s'
    }
  }
};

const evaluatorArgs = {
  name: 'valid_evaluator',
  description: 'Valid evaluator',
  inputSchema: z.object( { value: z.string() } ),
  fn
};

describe( 'interface validators', () => {
  describe( 'WorkflowValidator', () => {
    it( 'validates workflow definitions, input, output, and invocation options', () => {
      expect( () => WorkflowValidator.validateDefinition( workflowArgs ) ).not.toThrow();
      const validator = new WorkflowValidator( workflowArgs );
      const input = { value: 'ok' };
      const output = { result: 'ok' };

      expect( validator.parseInput( input ) ).toEqual( input );
      expect( validator.parseOutput( output ) ).toEqual( output );
      expect( () => validator.parseInvocationOptions( {
        detached: true,
        activityOptions: { retry: { maximumAttempts: 1 } },
        context: { info: { workflowId: 'test-workflow' } }
      } ) ).not.toThrow();
    } );

    it( 'throws ValidationError with useful prefixes for invalid workflow data', () => {
      expect( () => WorkflowValidator.validateDefinition( { ...workflowArgs, name: 'bad-name' } ) ).toThrow( ValidationError );
      expect( () => WorkflowValidator.validateDefinition( { ...workflowArgs, name: 'bad-name' } ) ).toThrow(
        /Workflow validation failed/
      );

      const validator = new WorkflowValidator( workflowArgs );

      expect( () => validator.parseInput( { value: 1 } ) ).toThrow( ValidationError );
      expect( () => validator.parseInput( { value: 1 } ) ).toThrow( /Workflow "valid_workflow" input validation failed/ );
      expect( () => validator.parseOutput( { result: 1 } ) ).toThrow( /Workflow "valid_workflow" output validation failed/ );
      expect( () => validator.parseInvocationOptions( {
        options: { activityOptions: { retry: { maximumAttempts: 1 } } }
      } ) ).toThrow( /Workflow "valid_workflow" invocation options validation failed/ );
    } );

    it( 'skips input and output validation when schemas are omitted', () => {
      const validator = new WorkflowValidator( {
        name: 'schema_less_workflow',
        fn
      } );
      const input = { anything: true };
      const output = { anything: true };

      expect( validator.parseInput( input ) ).toBe( input );
      expect( validator.parseOutput( output ) ).toBe( output );
    } );
  } );

  describe( 'StepValidator', () => {
    it( 'validates step definitions, input, and output', () => {
      expect( () => StepValidator.validateDefinition( stepArgs ) ).not.toThrow();
      const validator = new StepValidator( stepArgs );
      const input = { value: 'ok' };
      const output = { result: 'ok' };

      expect( validator.parseInput( input ) ).toEqual( input );
      expect( validator.parseOutput( output ) ).toEqual( output );
    } );

    it( 'throws ValidationError with useful prefixes for invalid step data', () => {
      expect( () => StepValidator.validateDefinition( { ...stepArgs, fn: 'not-a-function' } ) ).toThrow(
        /Step validation failed/
      );

      const validator = new StepValidator( stepArgs );

      expect( () => validator.parseInput( { value: 1 } ) ).toThrow( /Step "valid_step" input validation failed/ );
      expect( () => validator.parseOutput( { result: 1 } ) ).toThrow( /Step "valid_step" output validation failed/ );
    } );
  } );

  describe( 'EvaluatorValidator', () => {
    it( 'validates evaluator definitions, input, and EvaluationResult output', () => {
      expect( () => EvaluatorValidator.validateDefinition( evaluatorArgs ) ).not.toThrow();
      const validator = new EvaluatorValidator( evaluatorArgs );
      const input = { value: 'ok' };
      const output = new EvaluationResult( { value: 'pass', confidence: 1 } );

      expect( validator.parseInput( input ) ).toEqual( input );
      expect( validator.parseOutput( output ) ).toEqual( output );
    } );

    it( 'throws ValidationError for output schemas and invalid evaluator output', () => {
      expect( () => EvaluatorValidator.validateDefinition( {
        ...evaluatorArgs,
        outputSchema: z.string()
      } ) ).toThrow( /Evaluator validation failed/ );

      const validator = new EvaluatorValidator( evaluatorArgs );

      expect( () => validator.parseInput( { value: 1 } ) ).toThrow( /Evaluator "valid_evaluator" input validation failed/ );
      expect( () => validator.parseOutput( { value: 'pass', confidence: 1 } ) ).toThrow(
        /Evaluator "valid_evaluator" output validation failed/
      );
    } );
  } );

  describe( 'validateRequestPayload()', () => {
    it( 'accepts valid request payloads', () => {
      expect( () => validateRequestPayload( {
        url: 'https://example.com',
        method: 'POST',
        payload: { ok: true },
        headers: { authorization: 'Bearer token' },
        responseOptions: { includeHeaders: true, includeBody: true }
      } ) ).not.toThrow();
    } );

    it( 'throws ValidationError for invalid request payloads', () => {
      expect( () => validateRequestPayload( {
        url: 'ftp://example.com',
        method: 'POST'
      } ) ).toThrow( /Request payload validation failed/ );

      expect( () => validateRequestPayload( {
        url: 'https://example.com',
        method: 'OPTIONS'
      } ) ).toThrow( ValidationError );

      expect( () => validateRequestPayload( {
        url: 'https://example.com',
        method: 'GET',
        responseOptions: { includeHeaders: 'yes' }
      } ) ).toThrow( ValidationError );
    } );
  } );

  describe( 'validateExecuteInParallel()', () => {
    it( 'accepts valid parallel execution configs', () => {
      expect( () => validateExecuteInParallel( {
        jobs: [ () => 'ok' ],
        concurrency: Infinity,
        onJobCompleted: () => {}
      } ) ).not.toThrow();
    } );

    it( 'throws ValidationError for invalid parallel execution configs', () => {
      expect( () => validateExecuteInParallel( {
        jobs: [ () => 'ok' ],
        concurrency: 0
      } ) ).toThrow( /ExecuteInParallel validation failed/ );

      expect( () => validateExecuteInParallel( {
        jobs: [ 'not-a-function' ],
        concurrency: 1
      } ) ).toThrow( ValidationError );
    } );
  } );
} );
