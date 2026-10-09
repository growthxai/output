import { stepEventBus } from '#bus';

export const emitError = ( { requestId, method, url, status, durationMs } ) =>
  stepEventBus.emit( 'sdk:http:request', { requestId, method, url, status, durationMs, outcome: 'error' } );

export const emitSuccess = ( { requestId, method, url, status, durationMs } ) =>
  stepEventBus.emit( 'sdk:http:request', { requestId, method, url, status, durationMs, outcome: 'success' } );

export const emitFailure = ( { requestId, method, url, durationMs } ) =>
  stepEventBus.emit( 'sdk:http:request', { requestId, method, url, status: undefined, durationMs, outcome: 'failure' } );
