import { Tracing, emitEvent } from '@outputai/core/sdk_activity_integration';
import { calculateLLMCallCost } from './cost/index.js';

export const startTrace = ( name, details ) => {
  const traceId = `${name}-${Date.now()}`;
  Tracing.addEventStart( { kind: 'llm', name, id: traceId, details } );
  return traceId;
};

export const endTraceWithError = ( traceId, error ) => {
  Tracing.addEventError( { id: traceId, details: error } );
};

export const endTraceWithSuccess = async ( traceId, modelId, response, extraDetails = {} ) => {
  const { text: result, totalUsage: usage, providerMetadata } = response;
  const cost = await calculateLLMCallCost( { usage, modelId } );
  emitEvent( 'llm:call_cost', { modelId, cost, usage } );
  Tracing.addEventEnd( { id: traceId, details: { result, usage, cost, providerMetadata, ...extraDetails } } );
};

export const traceStreamCallbacks = ( traceId, modelId, { onFinish: userOnFinish, onError: userOnError } = {} ) => ( {
  async onFinish( response ) {
    await endTraceWithSuccess( traceId, modelId, response );
    userOnFinish?.( response );
  },
  onError( event ) {
    Tracing.addEventError( { id: traceId, details: event.error } );
    userOnError?.( event );
  }
} );
