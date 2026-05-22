import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

const emitter = new EventEmitter();
const originalEmit = emitter.emit.bind( emitter );

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray( value );

const attachEventId = payload => ( { ...payload, eventId: payload.eventId ?? randomUUID() } );

/**
 * Every object payload emitted through `messageBus` is stamped with a UUID v4
 * `eventId` — a stable per-emit idempotency key for downstream consumers
 * (webhook retry handling, ClickHouse `ReplacingMergeTree` dedup, audit logs,
 * etc.). Stamping happens at the bus layer, so any emit site — `emitEvent`,
 * lifecycle sinks, activity interceptor, future emitters — gets the field for
 * free.
 *
 * Callers may pre-set `eventId` on the payload to override the generated one
 * (useful for deterministic retry scenarios). Non-object payloads (primitives,
 * null, undefined, arrays) pass through unchanged.
 */
emitter.emit = ( event, ...args ) => {
  if ( args.length === 0 ) {
    return originalEmit( event );
  }

  const [ payload, ...rest ] = args;
  if ( !isObject( payload ) ) {
    return originalEmit( event, payload, ...rest );
  }

  return originalEmit( event, attachEventId( payload ), ...rest );
};

export const messageBus = emitter;
