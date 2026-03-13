import { describe, it, expect } from 'vitest';
import { InvalidTraceFileUrl } from './clients/errors.js';
import {
  buildWorkflowId,
  parseS3Url,
  extractTraceInfo,
  extractErrorMessage,
  takeFromAsyncIterable
} from './utils.js';

describe( 'utils spec', () => {
  describe( 'buildWorkflowId', () => {
    it( 'returns a non-empty string', () => {
      const id = buildWorkflowId();
      expect( typeof id ).toBe( 'string' );
      expect( id.length ).toBeGreaterThan( 0 );
    } );

    it( 'returns different ids on each call', () => {
      const a = buildWorkflowId();
      const b = buildWorkflowId();
      expect( a ).not.toBe( b );
    } );

    it( 'returns URL-safe alphanumeric id (nanoid format)', () => {
      const id = buildWorkflowId();
      expect( id ).toMatch( /^[A-Za-z0-9_-]+$/ );
    } );
  } );

  describe( 'parseS3Url', () => {
    it( 'extracts bucket, key, and region from valid S3 URL with region', () => {
      const url = 'https://my-bucket.s3.us-west-2.amazonaws.com/path/to/file.json';

      const result = parseS3Url( url );

      expect( result ).toEqual( {
        bucket: 'my-bucket',
        key: 'path/to/file.json',
        region: 'us-west-2'
      } );
    } );

    it( 'extracts bucket and key from S3 URL without region', () => {
      const url = 'https://output-ai-execution-prd-trace-files.s3.amazonaws.com/' +
        'example/2025/12/09/2025-12-09-22-19-36-901Z_example-1765318776897.json';

      const result = parseS3Url( url );

      expect( result.bucket ).toBe( 'output-ai-execution-prd-trace-files' );
      expect( result.key ).toBe( 'example/2025/12/09/2025-12-09-22-19-36-901Z_example-1765318776897.json' );
      expect( result.region ).toBeUndefined();
    } );

    it( 'decodes URL-encoded characters in object key', () => {
      const url = 'https://my-bucket.s3.amazonaws.com/path/to/file%20with%20spaces.json';

      const result = parseS3Url( url );

      expect( result.key ).toBe( 'path/to/file with spaces.json' );
    } );

    it( 'throws InvalidTraceFileUrl for non-S3 URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'http://bucket.s3.amazonaws.com/key',
        'https://s3.amazonaws.com/bucket/key',
        'https://bucket.s3.amazonaws.com/',
        'https://bucket.s3.amazonaws.com',
        'https://example.com/file.json',
        ''
      ];

      for ( const url of invalidUrls ) {
        expect( () => parseS3Url( url ) ).toThrow( InvalidTraceFileUrl );
        try {
          parseS3Url( url );
        } catch ( err ) {
          expect( err.message ).toBe( 'Url is not a valid S3 url' );
          expect( err.url ).toBe( url );
        }
      }
    } );

    it( 'throws InvalidTraceFileUrl for null and undefined', () => {
      expect( () => parseS3Url( null ) ).toThrow( InvalidTraceFileUrl );
      expect( () => parseS3Url( undefined ) ).toThrow( InvalidTraceFileUrl );
    } );

    it( 'throws InvalidTraceFileUrl when key has invalid percent-encoding', () => {
      const url = 'https://my-bucket.s3.amazonaws.com/path/%XXbad.json';

      expect( () => parseS3Url( url ) ).toThrow( InvalidTraceFileUrl );
      try {
        parseS3Url( url );
      } catch ( err ) {
        expect( err.message ).toBe( 'Error decoding the S3 key' );
        expect( err.url ).toBe( url );
        expect( err.cause ).toBeDefined();
      }
    } );
  } );

  describe( 'extractTraceInfo', () => {
    it( 'returns trace from error.details when present', () => {
      const tracePayload = { destinations: { local: 'xxx', remote: 'yyy' } };
      const error = { details: [ { trace: tracePayload } ] };

      expect( extractTraceInfo( error ) ).toEqual( tracePayload );
    } );

    it( 'returns trace from nested cause chain', () => {
      const tracePayload = { destinations: { local: 'xxx' } };
      const inner = { details: [ { trace: tracePayload } ] };
      const outer = { cause: inner };

      expect( extractTraceInfo( outer ) ).toEqual( tracePayload );
    } );

    it( 'returns trace from deeply nested cause chain', () => {
      const tracePayload = { destinations: { local: 'deep' } };
      const deepest = { details: [ { trace: tracePayload } ] };
      const middle = { cause: deepest };
      const outer = { cause: middle };

      expect( extractTraceInfo( outer ) ).toEqual( tracePayload );
    } );

    it( 'returns undefined for null input', () => {
      expect( extractTraceInfo( null ) ).toBeUndefined();
    } );

    it( 'returns undefined for undefined input', () => {
      expect( extractTraceInfo( undefined ) ).toBeUndefined();
    } );

    it( 'returns undefined when no trace exists in chain', () => {
      const error = { details: [ { other: 'data' } ], cause: { details: [] } };

      expect( extractTraceInfo( error ) ).toBeUndefined();
    } );

    it( 'handles errors without details array', () => {
      const error = { message: 'error without details' };

      expect( extractTraceInfo( error ) ).toBeUndefined();
    } );

    it( 'returns first trace found when multiple exist in chain', () => {
      const outerTrace = { destinations: { local: 'outer' } };
      const innerTrace = { destinations: { local: 'inner' } };
      const inner = { details: [ { trace: innerTrace } ] };
      const outer = { details: [ { trace: outerTrace } ], cause: inner };

      expect( extractTraceInfo( outer ) ).toEqual( outerTrace );
    } );

    it( 'handles error with empty details array', () => {
      const error = { details: [] };

      expect( extractTraceInfo( error ) ).toBeUndefined();
    } );

    it( 'handles details without trace property', () => {
      const error = { details: [ { foo: 'bar' }, { baz: 'qux' } ] };

      expect( extractTraceInfo( error ) ).toBeUndefined();
    } );

    it( 'uses details.find when details is array-like with find', () => {
      const tracePayload = { id: 't1' };
      const error = { details: [ { trace: tracePayload } ] };

      expect( extractTraceInfo( error ) ).toEqual( tracePayload );
    } );
  } );

  describe( 'extractErrorMessage', () => {
    it( 'returns null for null input', () => {
      expect( extractErrorMessage( null ) ).toBeNull();
    } );

    it( 'returns null for undefined input', () => {
      expect( extractErrorMessage( undefined ) ).toBeNull();
    } );

    it( 'returns message from a plain error without cause', () => {
      const error = { message: 'plain error' };

      expect( extractErrorMessage( error ) ).toBe( 'plain error' );
    } );

    it( 'returns deepest message from a cause chain', () => {
      const deepest = { message: 'test' };
      const middle = { message: 'Activity task failed', cause: deepest };
      const outer = { message: 'Workflow execution failed', cause: middle };

      expect( extractErrorMessage( outer ) ).toBe( 'test' );
    } );

    it( 'returns deepest message from a deep cause chain', () => {
      const step = { message: 'original step error' };
      const appFailure = { message: 'ApplicationFailure', cause: step };
      const activityFailure = { message: 'Activity task failed', cause: appFailure };
      const workflowFailure = { message: 'Workflow execution failed', cause: activityFailure };

      expect( extractErrorMessage( workflowFailure ) ).toBe( 'original step error' );
    } );

    it( 'returns null when deepest cause has no message', () => {
      const cause = {};
      const error = { message: 'outer', cause };

      expect( extractErrorMessage( error ) ).toBeNull();
    } );

    it( 'stops at max depth and returns message from that level', () => {
      const build = n => n === 0 ? { message: 'level 0' } : { message: `level ${n}`, cause: build( n - 1 ) };
      const chain = build( 25 );

      const result = extractErrorMessage( chain );
      expect( result ).toBeDefined();
      expect( result ).not.toBe( 'level 0' );
    } );
  } );

  describe( 'takeFromAsyncIterable', () => {
    it( 'takes up to N items from async iterable', async () => {
      async function *gen() {
        yield 1;
        yield 2;
        yield 3;
        yield 4;
        yield 5;
      }

      expect( await takeFromAsyncIterable( gen(), 3 ) ).toEqual( [ 1, 2, 3 ] );
    } );

    it( 'returns all items when iterable has fewer than count', async () => {
      async function *gen() {
        yield 'a';
        yield 'b';
      }

      expect( await takeFromAsyncIterable( gen(), 10 ) ).toEqual( [ 'a', 'b' ] );
    } );

    it( 'returns empty array when count is 0', async () => {
      async function *gen() {
        yield 1;
      }

      expect( await takeFromAsyncIterable( gen(), 0 ) ).toEqual( [] );
    } );

    it( 'returns empty array for empty iterable', async () => {
      async function *gen() {}

      expect( await takeFromAsyncIterable( gen(), 5 ) ).toEqual( [] );
    } );

    it( 'stops after reaching count and returns only that many items', async () => {
      async function *gen() {
        yield 10;
        yield 20;
        yield 30;
        yield 40;
      }

      const result = await takeFromAsyncIterable( gen(), 2 );
      expect( result ).toEqual( [ 10, 20 ] );
      expect( result ).toHaveLength( 2 );
    } );
  } );
} );
