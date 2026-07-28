import { Event } from '@outputai/core/sdk/runtime';

export const emitError = ( { requestId, method, url, status, durationMs } ) =>
  Event.emit( 'http:request', { requestId, method, url, status, durationMs, outcome: 'error' } );

export const emitSuccess = ( { requestId, method, url, status, durationMs } ) =>
  Event.emit( 'http:request', { requestId, method, url, status, durationMs, outcome: 'success' } );

export const emitFailure = ( { requestId, method, url, durationMs } ) =>
  Event.emit( 'http:request', { requestId, method, url, status: undefined, durationMs, outcome: 'failure' } );
