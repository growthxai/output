import { Tracing, Event } from '@outputai/core/sdk/runtime';

export const startTrace = ( { name, prompt } ) => {
  const id = `${name}-${Date.now()}`;
  Tracing.addEventStart( { kind: 'llm', id, name, details: { prompt } } );
  return id;
};

export const endTraceWithError = ( { traceId, error } ) => {
  Tracing.addEventError( { id: traceId, details: error } );
};

export const endTraceWithSuccess = ( { traceId, result, cost, ...extra } ) => {
  if ( cost ) {
    Tracing.addEventAttribute( { eventId: traceId, attribute: cost } );
    Event.emit( 'cost:llm:request', cost );
  }
  Tracing.addEventEnd( { id: traceId, details: { result, ...extra } } );
};
