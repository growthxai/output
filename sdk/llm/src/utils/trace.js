import { Tracing, emitEvent } from '@outputai/core/sdk_activity_integration';

export const startTrace = ( { name, ...details } ) => {
  const traceId = `${name}-${Date.now()}`;
  Tracing.addEventStart( { kind: 'llm', name, id: traceId, details } );
  return traceId;
};

export const endTraceWithError = ( { traceId, error } ) => {
  Tracing.addEventError( { id: traceId, details: error } );
};

export const endTraceWithSuccess = ( { traceId, result, cost, ...extra } ) => {
  if ( cost ) {
    Tracing.addEventAttribute( { eventId: traceId, attribute: cost } );
    emitEvent( 'cost:llm:request', cost );
  }
  Tracing.addEventEnd( { id: traceId, details: { result, ...extra } } );
};
