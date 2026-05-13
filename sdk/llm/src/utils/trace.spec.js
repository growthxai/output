import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import buildTraceTree from '../../../core/src/tracing/tools/build_trace_tree.js';
import { EventAction } from '../../../core/src/tracing/trace_consts.js';

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventStart: vi.fn(),
    addEventError: vi.fn(),
    addEventAttribute: vi.fn(),
    addEventEnd: vi.fn(),
    Attribute: {
      COST: 'cost',
      TOKEN_USAGE: 'token_usage'
    }
  },
  emitEvent: vi.fn()
} ) );

import { Tracing, emitEvent } from '@outputai/core/sdk_activity_integration';
import { startTrace, endTraceWithError, endTraceWithSuccess } from './trace.js';

const tracing = vi.mocked( Tracing, true );

describe( 'trace utils', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'startTrace', () => {
    it( 'starts an llm trace with name-based id and passes remaining fields as details', () => {
      vi.spyOn( Date, 'now' ).mockReturnValue( 9_000_000_000 );

      const traceId = startTrace( { name: 'generateText', prompt: 'p', variables: { k: 1 } } );

      expect( traceId ).toBe( 'generateText-9000000000' );
      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        kind: 'llm',
        name: 'generateText',
        id: 'generateText-9000000000',
        details: { prompt: 'p', variables: { k: 1 } }
      } );
    } );
  } );

  describe( 'endTraceWithError', () => {
    it( 'records an error on the trace event', () => {
      const err = new Error( 'failed' );

      endTraceWithError( { traceId: 't-1', error: err } );

      expect( tracing.addEventError ).toHaveBeenCalledWith( { id: 't-1', details: err } );
    } );
  } );

  describe( 'endTraceWithSuccess', () => {
    it( 'adds cost + token_usage attributes, ends the trace without usage in output, and emits both cost and token_usage events', () => {
      const cost = { total: 0.01, components: [] };
      const usage = { inputTokens: 2, outputTokens: 3 };
      const response = {
        text: 'hello',
        totalUsage: usage,
        providerMetadata: { provider: 'x' }
      };

      endTraceWithSuccess( {
        traceId: 'trace-a',
        modelId: 'my-model',
        response,
        cost,
        sourcesFromTools: [ { url: 'https://u.test', title: '' } ]
      } );

      expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
        eventId: 'trace-a',
        name: 'cost',
        value: cost
      } );
      expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
        eventId: 'trace-a',
        name: 'token_usage',
        value: usage
      } );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'trace-a',
        details: {
          result: 'hello',
          providerMetadata: { provider: 'x' },
          sourcesFromTools: [ { url: 'https://u.test', title: '' } ]
        }
      } );
      expect( tracing.addEventEnd.mock.calls[0][0].details ).not.toHaveProperty( 'usage' );
      expect( emitEvent ).toHaveBeenCalledWith( 'cost:llm:request', {
        modelId: 'my-model',
        cost,
        usage
      } );
      expect( emitEvent ).toHaveBeenCalledWith( 'token_usage:llm:request', {
        modelId: 'my-model',
        usage
      } );
    } );

    it( 'produces an llm trace node with attributes.token_usage and no output.usage when fed through buildTraceTree', () => {
      const usage = { inputTokens: 12, outputTokens: 7, cachedInputTokens: 3, totalTokens: 22 };
      const cost = { total: 0.0042, components: [ { name: 'input_tokens', value: 0.002 } ] };
      const response = {
        text: 'tree result',
        totalUsage: usage,
        providerMetadata: { provider: 'p' }
      };

      // Capture the calls the wrapper makes against Tracing/emit, and translate them into trace
      // entries — what buildTraceTree consumes server-side to materialize the persisted trace JSON.
      endTraceWithSuccess( { traceId: 'llm-1', modelId: 'm', response, cost } );

      const entries = [
        { kind: 'workflow', action: EventAction.START, name: 'wf', id: 'wf', parentId: undefined, details: {}, timestamp: 1 },
        { kind: 'llm', action: EventAction.START, name: 'generateText', id: 'llm-1', parentId: 'wf', details: { prompt: 'p' }, timestamp: 10 }
      ];
      for ( const call of Tracing.addEventAttribute.mock.calls ) {
        entries.push( { id: call[0].eventId, action: EventAction.ADD_ATTR, details: { name: call[0].name, value: call[0].value }, timestamp: 20 } );
      }
      const endDetails = Tracing.addEventEnd.mock.calls[0][0].details;
      entries.push( { id: 'llm-1', action: EventAction.END, details: endDetails, timestamp: 30 } );
      entries.push( { id: 'wf', action: EventAction.END, details: {}, timestamp: 40 } );

      const tree = buildTraceTree( entries );
      const llmNode = tree.children[0];

      expect( llmNode.kind ).toBe( 'llm' );
      expect( llmNode.attributes.token_usage ).toEqual( usage );
      expect( llmNode.attributes.cost ).toEqual( cost );
      expect( llmNode.output ).not.toHaveProperty( 'usage' );
      expect( llmNode.output ).toMatchObject( { result: 'tree result', providerMetadata: { provider: 'p' } } );
    } );
  } );
} );
