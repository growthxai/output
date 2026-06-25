import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { isPlainObject } from '#helpers/object';

const emitter = new EventEmitter();

/**
 * Every object payload emitted through `messageBus` is stamped with a UUID v4 `eventId`.
 */
emitter.emit = new Proxy( emitter.emit, {
  apply( target, thisArg, args ) {
    const [ eventName, payload, ...extras ] = args;
    const newArguments = [];

    // do now push arguments that dont exist. if payload is undefined with len=1, means it was never defined
    // if payload is undefined with len>1, means user passed 'undefined' as argument
    if ( args.length > 1 ) {
      newArguments.push( isPlainObject( payload ) ? {
        eventId: randomUUID(),
        eventDate: Date.now(),
        ...payload
      } : payload );
      newArguments.push( ...extras );
    }

    return Reflect.apply( target, thisArg, [ eventName, ...newArguments ] );
  }
} );

export const messageBus = emitter;
