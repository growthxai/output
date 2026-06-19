import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock( '@outputai/core/internal/activity', () => ( {
  Tracing: {
    addEventStart: vi.fn(),
    addEventError: vi.fn(),
    addEventAttribute: vi.fn(),
    addEventEnd: vi.fn()
  },
  Event: {
    emit: vi.fn()
  }
} ) );

import { Tracing, Event } from '@outputai/core/internal/activity';
import { startTrace, endTraceWithError, endTraceWithSuccess } from './trace.js';

const tracing = vi.mocked( Tracing, true );
const event = vi.mocked( Event, true );

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
    it( 'adds cost attribute, emits cost event, and ends the trace with normalized details', () => {
      const cost = { type: 'llm:usage', modelId: 'my-model', total: 0.01, usage: [] };
      const usage = { inputTokens: 2, outputTokens: 3 };

      endTraceWithSuccess( {
        traceId: 'trace-a',
        modelId: 'my-model',
        result: 'hello',
        usage,
        providerMetadata: { provider: 'x' },
        cost,
        sourcesFromTools: [ { url: 'https://u.test', title: '' } ]
      } );

      expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
        eventId: 'trace-a',
        attribute: cost
      } );
      expect( event.emit ).toHaveBeenCalledWith( 'cost:llm:request', cost );
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'trace-a',
        details: {
          result: 'hello',
          modelId: 'my-model',
          usage,
          providerMetadata: { provider: 'x' },
          sourcesFromTools: [ { url: 'https://u.test', title: '' } ]
        }
      } );
    } );

    it( 'does not emit or add an attribute when cost is missing', () => {
      const usage = { inputTokens: 2, outputTokens: 3 };

      endTraceWithSuccess( {
        traceId: 'trace-no-cost',
        modelId: 'my-model',
        result: 'hello',
        usage,
        providerMetadata: { provider: 'x' }
      } );

      expect( tracing.addEventAttribute ).not.toHaveBeenCalled();
      expect( event.emit ).not.toHaveBeenCalled();
      expect( tracing.addEventEnd ).toHaveBeenCalledWith( {
        id: 'trace-no-cost',
        details: {
          result: 'hello',
          modelId: 'my-model',
          usage,
          providerMetadata: { provider: 'x' }
        }
      } );
    } );
  } );
} );
