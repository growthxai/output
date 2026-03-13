import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validateStep,
  validateWorkflow,
  validateRequestPayload,
  validateEvaluator,
  validateExecuteInParallel,
  StaticValidationError
} from './static.js';

const validArgs = Object.freeze( {
  name: 'valid_name',
  description: 'desc',
  inputSchema: z.object( {} ),
  outputSchema: z.object( {} ),
  fn: () => {}
} );

describe( 'interface/validator', () => {
  describe( 'validateStep', () => {
    it( 'passes for valid args', () => {
      expect( () => validateStep( { ...validArgs } ) ).not.toThrow();
    } );

    it( 'rejects missing name', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected string, received undefined\n  → at name' );
      expect( () => validateStep( { ...validArgs, name: undefined } ) ).toThrow( error );
    } );

    it( 'rejects non-string name', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected string, received number\n  → at name' );
      expect( () => validateStep( { ...validArgs, name: 123 } ) ).toThrow( error );
    } );

    it( 'rejects invalid name pattern', () => {
      const error = new StaticValidationError( '✖ Invalid string: must match pattern /^[a-z_][a-z0-9_]*$/i\n  → at name' );
      expect( () => validateStep( { ...validArgs, name: '-bad' } ) ).toThrow( error );
    } );

    it( 'rejects non-string description', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected string, received number\n  → at description' );
      expect( () => validateStep( { ...validArgs, description: 10 } ) ).toThrow( error );
    } );

    it( 'rejects non-Zod inputSchema', () => {
      const error = new StaticValidationError( '✖ Schema must be a Zod schema\n  → at inputSchema' );
      expect( () => validateStep( { ...validArgs, inputSchema: 'not-a-zod-schema' } ) ).toThrow( error );
    } );

    it( 'rejects JSON Schema inputSchema', () => {
      const error = new StaticValidationError( '✖ Schema must be a Zod schema\n  → at inputSchema' );
      expect( () => validateStep( { ...validArgs, inputSchema: { type: 'object' } } ) ).toThrow( error );
    } );

    it( 'rejects non-Zod outputSchema', () => {
      const error = new StaticValidationError( '✖ Schema must be a Zod schema\n  → at outputSchema' );
      expect( () => validateStep( { ...validArgs, outputSchema: 10 } ) ).toThrow( error );
    } );

    it( 'rejects JSON Schema outputSchema', () => {
      const error = new StaticValidationError( '✖ Schema must be a Zod schema\n  → at outputSchema' );
      expect( () => validateStep( { ...validArgs, outputSchema: { type: 'string' } } ) ).toThrow( error );
    } );

    it( 'rejects missing fn', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected function, received undefined\n  → at fn' );
      expect( () => validateStep( { ...validArgs, fn: undefined } ) ).toThrow( error );
    } );

    it( 'rejects non-function fn', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected function, received string\n  → at fn' );
      expect( () => validateStep( { ...validArgs, fn: 'not-fn' } ) ).toThrow( error );
    } );

    it( 'passes with options.activityOptions.retry (second-level options)', () => {
      const args = {
        ...validArgs,
        options: {
          activityOptions: {
            retry: {
              initialInterval: '1s',
              backoffCoefficient: 2,
              maximumInterval: '10s',
              maximumAttempts: 3,
              nonRetryableErrorTypes: [ 'SomeError' ]
            }
          }
        }
      };
      expect( () => validateStep( args ) ).not.toThrow();
    } );

    it( 'passes with options.activityOptions.activityId as string', () => {
      expect( () => validateStep( { ...validArgs, options: { activityOptions: { activityId: 'act-123' } } } ) ).not.toThrow();
    } );

    it( 'rejects non-string options.activityOptions.activityId', () => {
      expect( () => validateStep( { ...validArgs, options: { activityOptions: { activityId: 123 } } } ) ).toThrow( StaticValidationError );
    } );

    it( 'passes with valid options.activityOptions.cancellationType values', () => {
      for ( const v of [ 'TRY_CANCEL', 'WAIT_CANCELLATION_COMPLETED', 'ABANDON' ] ) {
        expect( () => validateStep( { ...validArgs, options: { activityOptions: { cancellationType: v } } } ) ).not.toThrow();
      }
    } );

    it( 'rejects invalid options.activityOptions.cancellationType', () => {
      const args = { ...validArgs, options: { activityOptions: { cancellationType: 'INVALID' } } };
      expect( () => validateStep( args ) ).toThrow( StaticValidationError );
    } );

    it( 'accepts duration fields in options.activityOptions', () => {
      const options = {
        activityOptions: {
          heartbeatTimeout: '1s',
          scheduleToCloseTimeout: '2m',
          scheduleToStartTimeout: '3m',
          startToCloseTimeout: '4m'
        }
      };
      expect( () => validateStep( { ...validArgs, options } ) ).not.toThrow();
    } );

    it( 'rejects invalid duration string in options.activityOptions.heartbeatTimeout', () => {
      expect( () => validateStep( { ...validArgs, options: { activityOptions: { heartbeatTimeout: '5x' } } } ) ).toThrow( StaticValidationError );
    } );

    it( 'passes with options.activityOptions.summary string', () => {
      expect( () => validateStep( { ...validArgs, options: { activityOptions: { summary: 'brief' } } } ) ).not.toThrow();
    } );

    it( 'rejects non-string options.activityOptions.summary', () => {
      expect( () => validateStep( { ...validArgs, options: { activityOptions: { summary: 42 } } } ) ).toThrow( StaticValidationError );
    } );

    it( 'passes with options.activityOptions.priority valid payload', () => {
      const options = {
        activityOptions: {
          priority: {
            fairnessKey: 'user-1',
            fairnessWeight: 1.5,
            priorityKey: 10
          }
        }
      };
      expect( () => validateStep( { ...validArgs, options } ) ).not.toThrow();
    } );

    it( 'rejects invalid options.activityOptions.priority values', () => {
      const options = { activityOptions: { priority: { fairnessWeight: 0, priorityKey: 0 } } };
      expect( () => validateStep( { ...validArgs, options } ) ).toThrow( StaticValidationError );
    } );

    it( 'rejects invalid options.activityOptions.retry values', () => {
      const options = { activityOptions: { retry: { backoffCoefficient: 0.5, maximumAttempts: 0, nonRetryableErrorTypes: [ 1 ] } } };
      expect( () => validateStep( { ...validArgs, options } ) ).toThrow( StaticValidationError );
    } );

    it( 'rejects unknown keys inside options.activityOptions due to strictObject', () => {
      expect( () => validateStep( { ...validArgs, options: { activityOptions: { unknownKey: true } } } ) ).toThrow( StaticValidationError );
    } );

    it( 'rejects unknown top-level keys due to strictObject', () => {
      expect( () => validateStep( { ...validArgs, extra: 123 } ) ).toThrow( StaticValidationError );
    } );
  } );

  describe( 'validateWorkflow', () => {
    it( 'passes for valid args', () => {
      expect( () => validateWorkflow( { ...validArgs } ) ).not.toThrow();
    } );

    it( 'passes with options.disableTrace true', () => {
      expect( () => validateWorkflow( { ...validArgs, options: { disableTrace: true } } ) ).not.toThrow();
    } );

    it( 'passes with options.disableTrace false', () => {
      expect( () => validateWorkflow( { ...validArgs, options: { disableTrace: false } } ) ).not.toThrow();
    } );

    it( 'passes with options.activityOptions and options.disableTrace', () => {
      expect( () => validateWorkflow( {
        ...validArgs,
        options: { activityOptions: { activityId: 'wf-1' }, disableTrace: true }
      } ) ).not.toThrow();
    } );

    it( 'rejects non-boolean options.disableTrace', () => {
      expect( () => validateWorkflow( { ...validArgs, options: { disableTrace: 'yes' } } ) ).toThrow( StaticValidationError );
    } );
  } );

  describe( 'validateEvaluator', () => {
    const base = Object.freeze( {
      name: 'valid_name',
      description: 'desc',
      inputSchema: z.object( {} ),
      fn: () => {}
    } );

    it( 'passes for valid args (no outputSchema)', () => {
      expect( () => validateEvaluator( { ...base } ) ).not.toThrow();
    } );

    it( 'rejects invalid name pattern', () => {
      const error = new StaticValidationError( '✖ Invalid string: must match pattern /^[a-z_][a-z0-9_]*$/i\n  → at name' );
      expect( () => validateEvaluator( { ...base, name: '-bad' } ) ).toThrow( error );
    } );

    it( 'rejects non-Zod inputSchema', () => {
      const error = new StaticValidationError( '✖ Schema must be a Zod schema\n  → at inputSchema' );
      expect( () => validateEvaluator( { ...base, inputSchema: 'not-a-zod-schema' } ) ).toThrow( error );
    } );

    it( 'rejects missing fn', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected function, received undefined\n  → at fn' );
      expect( () => validateEvaluator( { ...base, fn: undefined } ) ).toThrow( error );
    } );
  } );

  describe( 'validate request', () => {
    it( 'passes with valid http url', () => {
      expect( () => validateRequestPayload( { url: 'http://example.com', method: 'GET' } ) ).not.toThrow();
    } );

    it( 'passes with valid https url', () => {
      expect( () => validateRequestPayload( { url: 'https://example.com/path?q=1', method: 'GET' } ) ).not.toThrow();
    } );

    it( 'rejects missing url', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected string, received undefined\n  → at url' );
      expect( () => validateRequestPayload( { method: 'GET' } ) ).toThrow( error );
    } );

    it( 'rejects invalid scheme', () => {
      const error = new StaticValidationError( '✖ Invalid URL\n  → at url' );
      expect( () => validateRequestPayload( { url: 'ftp://example.com', method: 'GET' } ) ).toThrow( error );
    } );

    it( 'rejects malformed url', () => {
      const error = new StaticValidationError( '✖ Invalid URL\n  → at url' );
      expect( () => validateRequestPayload( { url: 'http:////', method: 'GET' } ) ).toThrow( error );
    } );

    it( 'rejects missing method', () => {
      expect( () => validateRequestPayload( { url: 'https://example.com' } ) ).toThrow( StaticValidationError );
    } );

    it( 'passes with headers as string map', () => {
      const request = {
        url: 'https://example.com',
        method: 'GET',
        headers: { 'x-api-key': 'abc', accept: 'application/json' }
      };
      expect( () => validateRequestPayload( request ) ).not.toThrow();
    } );

    it( 'rejects non-object headers', () => {
      const request = {
        url: 'https://example.com',
        method: 'GET',
        headers: 5
      };
      expect( () => validateRequestPayload( request ) ).toThrow( StaticValidationError );
    } );

    it( 'rejects headers with non-string values', () => {
      const request = {
        url: 'https://example.com',
        method: 'GET',
        headers: { 'x-num': 123 }
      };
      expect( () => validateRequestPayload( request ) ).toThrow( StaticValidationError );
    } );

    it( 'passes with payload object', () => {
      const request = {
        url: 'https://example.com/api',
        method: 'POST',
        payload: { a: 1, b: 'two' }
      };
      expect( () => validateRequestPayload( request ) ).not.toThrow();
    } );

    it( 'passes with payload string', () => {
      const request = {
        url: 'https://example.com/upload',
        method: 'POST',
        payload: 'raw-body'
      };
      expect( () => validateRequestPayload( request ) ).not.toThrow();
    } );
  } );

  describe( 'validateExecuteInParallel', () => {
    const validArgs = Object.freeze( {
      jobs: [ () => {}, () => {} ],
      concurrency: 5
    } );

    it( 'passes for valid args', () => {
      expect( () => validateExecuteInParallel( { ...validArgs } ) ).not.toThrow();
    } );

    it( 'rejects missing concurrency', () => {
      const error = new StaticValidationError( '✖ Invalid input\n  → at concurrency' );
      expect( () => validateExecuteInParallel( { jobs: validArgs.jobs } ) ).toThrow( error );
    } );

    it( 'passes with onJobCompleted callback', () => {
      const args = {
        ...validArgs,
        onJobCompleted: () => {}
      };
      expect( () => validateExecuteInParallel( args ) ).not.toThrow();
    } );

    it( 'passes with concurrency 1', () => {
      expect( () => validateExecuteInParallel( { ...validArgs, concurrency: 1 } ) ).not.toThrow();
    } );

    it( 'passes with concurrency Infinity', () => {
      expect( () => validateExecuteInParallel( { ...validArgs, concurrency: Infinity } ) ).not.toThrow();
    } );

    it( 'rejects missing jobs', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected array, received undefined\n  → at jobs' );
      expect( () => validateExecuteInParallel( { concurrency: 5 } ) ).toThrow( error );
    } );

    it( 'rejects non-array jobs', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected array, received string\n  → at jobs' );
      expect( () => validateExecuteInParallel( { jobs: 'not-array', concurrency: 5 } ) ).toThrow( error );
    } );

    it( 'passes with empty jobs array', () => {
      expect( () => validateExecuteInParallel( { jobs: [], concurrency: 5 } ) ).not.toThrow();
    } );

    it( 'rejects jobs array with non-function', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected function, received string\n  → at jobs[1]' );
      expect( () => validateExecuteInParallel( { jobs: [ () => {}, 'not-function' ], concurrency: 5 } ) ).toThrow( error );
    } );

    it( 'rejects non-number concurrency', () => {
      const error = new StaticValidationError( '✖ Invalid input\n  → at concurrency' );
      expect( () => validateExecuteInParallel( { jobs: validArgs.jobs, concurrency: '5' } ) ).toThrow( error );
    } );

    it( 'rejects zero concurrency', () => {
      const error = new StaticValidationError( '✖ Too small: expected number to be >=1\n  → at concurrency' );
      expect( () => validateExecuteInParallel( { jobs: validArgs.jobs, concurrency: 0 } ) ).toThrow( error );
    } );

    it( 'rejects negative concurrency', () => {
      const error = new StaticValidationError( '✖ Too small: expected number to be >=1\n  → at concurrency' );
      expect( () => validateExecuteInParallel( { ...validArgs, concurrency: -1 } ) ).toThrow( error );
    } );

    it( 'rejects non-function onJobCompleted', () => {
      const error = new StaticValidationError( '✖ Invalid input: expected function, received string\n  → at onJobCompleted' );
      expect( () => validateExecuteInParallel( { ...validArgs, onJobCompleted: 'not-function' } ) ).toThrow( error );
    } );
  } );
} );
