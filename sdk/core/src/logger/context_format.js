import winston from 'winston';
import { Storage } from '#async_storage';
import { serializedActivityFields } from './context_fields.js';

/**
 * Winston format that enriches every log emitted inside an activity (step,
 * evaluator, or internal step) with its workflow execution context, read from
 * AsyncLocalStorage at log time. Fields already on the entry win, so
 * caller-supplied metadata is never overwritten. Logs emitted outside an
 * activity (worker startup, monitoring) are left untouched.
 */
export const contextFormat = winston.format( info => {
  const ctx = Storage.load();
  if ( ctx?.activityInfo ) {
    const fields = serializedActivityFields( ctx.activityInfo );
    Object.keys( fields ).forEach( key => {
      if ( !( key in info ) ) {
        info[key] = fields[key];
      }
    } );
  }
  return info;
} );
