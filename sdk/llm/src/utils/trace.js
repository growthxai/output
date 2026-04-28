import { Tracing, emitEvent } from '@outputai/core/sdk_activity_integration';

export const startTrace = ( { name, ...details } ) => {
  const traceId = `${name}-${Date.now()}`;
  Tracing.addEventStart( { kind: 'llm', name, id: traceId, details } );
  return traceId;
};

export const endTraceWithError = ( { traceId, error } ) => {
  Tracing.addEventError( { id: traceId, details: error } );
};

export const endTraceWithSuccess = ( { traceId, modelId, response, cost, ...extra } ) => {
  const { totalUsage: usage, text: result, providerMetadata } = response;
  Tracing.addEventAttribute( { eventId: traceId, name: Tracing.Attribute.COST, value: cost } );
  Tracing.addEventEnd( { id: traceId, details: { result, cost, usage, providerMetadata, ...extra } } );
  emitEvent( 'llm:call_cost', { modelId, cost, usage } );
};
