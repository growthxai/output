import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventStart: vi.fn(),
    addEventError: vi.fn(),
    addEventAttribute: vi.fn(),
    addEventEnd: vi.fn(),
    Attribute: {
      COST: 'cost'
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
    it( 'adds cost attribute, ends the trace with response fields and extra details, and emits cost:llm:request', () => {
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
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'trace-a',
        details: {
          result: 'hello',
          usage,
          providerMetadata: { provider: 'x' },
          sourcesFromTools: [ { url: 'https://u.test', title: '' } ]
        }
      } );
      expect( emitEvent ).toHaveBeenCalledWith( 'cost:llm:request', {
        modelId: 'my-model',
        cost,
        usage
      } );
    } );
  } );
} );
