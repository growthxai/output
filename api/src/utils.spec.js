import { describe, it, expect } from 'vitest';
import { InvalidTraceFileUrl } from './clients/errors.js';
import {
  buildWorkflowId,
  parseS3Url,
  extractErrorDetail,
  extractErrorMessage,
  serializeErrorChain,
  extractFailure,
  serializeTemporalError,
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

  describe( 'extractErrorDetail', () => {
    it( 'returns trace from error.details when present', () => {
      const tracePayload = { destinations: { local: 'xxx', remote: 'yyy' } };
      const error = { details: [ { trace: tracePayload } ] };

      expect( extractErrorDetail( error, 'trace' ) ).toEqual( tracePayload );
    } );

    it( 'returns trace from nested cause chain', () => {
      const tracePayload = { destinations: { local: 'xxx' } };
      const inner = { details: [ { trace: tracePayload } ] };
      const outer = { cause: inner };

      expect( extractErrorDetail( outer, 'trace' ) ).toEqual( tracePayload );
    } );

    it( 'returns trace from deeply nested cause chain', () => {
      const tracePayload = { destinations: { local: 'deep' } };
      const deepest = { details: [ { trace: tracePayload } ] };
      const middle = { cause: deepest };
      const outer = { cause: middle };

      expect( extractErrorDetail( outer, 'trace' ) ).toEqual( tracePayload );
    } );

    it( 'returns null for null input', () => {
      expect( extractErrorDetail( null, 'trace' ) ).toBeNull();
    } );

    it( 'returns null for undefined input', () => {
      expect( extractErrorDetail( undefined, 'trace' ) ).toBeNull();
    } );

    it( 'returns null when no trace exists in chain', () => {
      const error = { details: [ { other: 'data' } ], cause: { details: [] } };

      expect( extractErrorDetail( error, 'trace' ) ).toBeNull();
    } );

    it( 'handles errors without details array', () => {
      const error = { message: 'error without details' };

      expect( extractErrorDetail( error, 'trace' ) ).toBeNull();
    } );

    it( 'returns first trace found when multiple exist in chain', () => {
      const outerTrace = { destinations: { local: 'outer' } };
      const innerTrace = { destinations: { local: 'inner' } };
      const inner = { details: [ { trace: innerTrace } ] };
      const outer = { details: [ { trace: outerTrace } ], cause: inner };

      expect( extractErrorDetail( outer, 'trace' ) ).toEqual( outerTrace );
    } );

    it( 'handles error with empty details array', () => {
      const error = { details: [] };

      expect( extractErrorDetail( error, 'trace' ) ).toBeNull();
    } );

    it( 'handles details without trace property', () => {
      const error = { details: [ { foo: 'bar' }, { baz: 'qux' } ] };

      expect( extractErrorDetail( error, 'trace' ) ).toBeNull();
    } );

    it( 'uses details.find when details is array-like with find', () => {
      const tracePayload = { id: 't1' };
      const error = { details: [ { trace: tracePayload } ] };

      expect( extractErrorDetail( error, 'trace' ) ).toEqual( tracePayload );
    } );

    it( 'returns the requested detail from a nested cause chain', () => {
      const aggregations = { cost: { total: 1 } };
      const error = { cause: { details: [ { aggregations } ] } };

      expect( extractErrorDetail( error, 'aggregations' ) ).toBe( aggregations );
    } );

    it( 'returns null when the requested detail is missing', () => {
      const error = { details: [ { trace: {} } ], cause: { details: [] } };

      expect( extractErrorDetail( error, 'aggregations' ) ).toBeNull();
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

  describe( 'extractFailure', () => {
    it( 'returns null for null and undefined', () => {
      expect( extractFailure( null ) ).toBeNull();
      expect( extractFailure( undefined ) ).toBeNull();
    } );

    it( 'extracts message/type/retryable from the ApplicationFailure node, skipping wrappers', () => {
      const appFailure = { type: 'ValidationError', nonRetryable: true, message: 'bad input', cause: { message: 'bad input' } };
      const activityFailure = { message: 'Activity task failed', cause: appFailure };
      const workflowError = { message: 'Workflow execution failed', cause: activityFailure };

      const failure = extractFailure( workflowError );

      expect( failure.message ).toBe( 'bad input' );
      expect( failure.type ).toBe( 'ValidationError' );
      expect( failure.retryable ).toBe( false );
    } );

    it( 'returns retryable true when nonRetryable is false', () => {
      const appFailure = { type: 'SomeError', nonRetryable: false, message: 'oops' };

      expect( extractFailure( appFailure ).retryable ).toBe( true );
    } );

    it( 'returns retryable null when nonRetryable is absent', () => {
      const appFailure = { type: 'SomeError', message: 'oops' };

      expect( extractFailure( appFailure ).retryable ).toBeNull();
    } );

    it( 'falls back to the deepest message and a null retryable when there is no ApplicationFailure node', () => {
      const root = new Error( 'root cause' );
      const activity = new Error( 'Activity task failed' );
      activity.cause = root;
      const workflowError = new Error( 'Workflow execution failed' );
      workflowError.cause = activity;

      const failure = extractFailure( workflowError );

      expect( failure.message ).toBe( 'root cause' );
      expect( failure.type ).toBe( 'Error' );
      expect( failure.retryable ).toBeNull();
    } );

    it( 'includes a sanitized cause chain', () => {
      const workflowError = { message: 'top', cause: { type: 'X', nonRetryable: true, message: 'mid' } };

      expect( extractFailure( workflowError ).cause ).toEqual( {
        name: 'Object',
        message: 'top',
        cause: { name: 'Object', type: 'X', message: 'mid' }
      } );
    } );
  } );

  describe( 'serializeErrorChain', () => {
    it( 'returns null for falsy input', () => {
      expect( serializeErrorChain( null ) ).toBeNull();
      expect( serializeErrorChain( undefined ) ).toBeNull();
    } );

    it( 'serializes a single node and omits stack, details, and cause', () => {
      const node = serializeErrorChain( { message: 'x', stack: 'STACK', details: [ { trace: {} } ] } );

      expect( node ).toEqual( { name: 'Object', message: 'x' } );
      expect( node.stack ).toBeUndefined();
    } );

    it( 'includes type only when present', () => {
      expect( serializeErrorChain( { type: 'ValidationError', message: 'x' } ) )
        .toEqual( { name: 'Object', type: 'ValidationError', message: 'x' } );
      expect( serializeErrorChain( { message: 'x' } ).type ).toBeUndefined();
    } );

    it( 'serializes a nested cause chain', () => {
      const chain = { message: 'a', cause: { message: 'b', cause: { message: 'c' } } };

      expect( serializeErrorChain( chain ) ).toEqual( {
        name: 'Object',
        message: 'a',
        cause: { name: 'Object', message: 'b', cause: { name: 'Object', message: 'c' } }
      } );
    } );

    it( 'stops at depth > 10 with a sentinel', () => {
      const build = n => n === 0 ? { message: 'deep' } : { message: `l${n}`, cause: build( n - 1 ) };
      const deepest = node => node.cause ? deepest( node.cause ) : node;

      expect( deepest( serializeErrorChain( build( 12 ) ) ) ).toEqual( { name: 'Error', message: 'Cause chain too deep' } );
    } );
  } );

  describe( 'serializeTemporalError', () => {
    it( 'serializes a plain Error with name, message and stack but no gRPC fields or cause', () => {
      const out = serializeTemporalError( new Error( 'boom' ) );

      expect( out.name ).toBe( 'Error' );
      expect( out.message ).toBe( 'boom' );
      expect( out.stack ).toBeDefined();
      expect( out.code ).toBeUndefined();
      expect( out.cause ).toBeUndefined();
    } );

    it( 'nests the cause chain and keeps stack on the top node only', () => {
      const top = new Error( 'top' );
      top.cause = new Error( 'root' );

      const out = serializeTemporalError( top );

      expect( out.stack ).toBeDefined();
      expect( out.cause.message ).toBe( 'root' );
      expect( out.cause.stack ).toBeUndefined();
    } );

    it( 'captures gRPC code/codeName/details and redacts metadata to key names plus an allowlist', () => {
      const out = serializeTemporalError( {
        message: '14 UNAVAILABLE: connection failed',
        code: 14,
        details: 'connection failed',
        metadata: { authorization: 'Bearer secret', 'content-type': 'application/grpc' }
      } );

      expect( out.code ).toBe( 14 );
      expect( out.codeName ).toBe( 'UNAVAILABLE' );
      expect( out.details ).toBe( 'connection failed' );
      expect( out.metadata.keys ).toEqual( [ 'authorization', 'content-type' ] );
      expect( out.metadata.authorization ).toBeUndefined();
      expect( out.metadata['content-type'] ).toBe( 'application/grpc' );
    } );

    it( 'finds the gRPC code one cause level down (the "Failed to query Workflow" wrapper)', () => {
      const out = serializeTemporalError( {
        message: 'Failed to query Workflow',
        cause: { message: '14 UNAVAILABLE', code: 14, details: 'x', metadata: {} }
      } );

      expect( out.code ).toBeUndefined();
      expect( out.cause.code ).toBe( 14 );
      expect( out.cause.codeName ).toBe( 'UNAVAILABLE' );
    } );

    it( 'returns { value } for non-Error throwables', () => {
      expect( serializeTemporalError( 'boom' ) ).toEqual( { value: 'boom' } );
      expect( serializeTemporalError( 42 ) ).toEqual( { value: '42' } );
      expect( serializeTemporalError( null ) ).toEqual( { value: 'null' } );
    } );

    it( 'surfaces context annotations', () => {
      const err = new Error( 'x' );
      Object.assign( err, { workflowId: 'wf1', runId: 'run1', taskQueue: 'q', query: 'get' } );

      expect( serializeTemporalError( err ) ).toMatchObject( {
        workflowId: 'wf1', runId: 'run1', taskQueue: 'q', query: 'get'
      } );
    } );

    it( 'stops at depth > 10 with a sentinel', () => {
      const build = n => n === 0 ? { message: 'deep' } : { message: `l${n}`, cause: build( n - 1 ) };
      const deepest = node => node.cause ? deepest( node.cause ) : node;

      expect( deepest( serializeTemporalError( build( 12 ) ) ) ).toEqual( { name: 'Error', message: 'Cause chain too deep' } );
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
