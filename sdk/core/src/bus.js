import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { isPlainObject } from '#utils';

const emitter = new EventEmitter();
const originalEmit = emitter.emit.bind( emitter );

const attachEventId = payload => ( { ...payload, eventId: payload.eventId ?? randomUUID() } );

/**
 * Every object payload emitted through `messageBus` is stamped with a UUID v4 `eventId`.
 */
emitter.emit = ( event, ...args ) => {
  const [ payload, ...rest ] = args;
  if ( !isPlainObject( payload ) ) {
    return originalEmit( event, ...args );
  }
  return originalEmit( event, attachEventId( payload ), ...rest );
};

export const messageBus = emitter;
