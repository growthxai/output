import { Storage } from '#async_storage';
import { EventEmitter } from 'node:events';
import { serializeError } from './tools/utils.js';
import { isStringboolTrue } from '#utils';
import * as localProcessor from './processors/local/index.js';
import * as s3Processor from './processors/s3/index.js';
import { ComponentType } from '#consts';
import { createChildLogger } from '#logger';
import { EventAction } from './trace_consts.js';
import { BaseAttribute } from './trace_attribute.js';

const log = createChildLogger( 'Tracing' );

const traceBus = new EventEmitter();
const processors = [
  {
    enabled: isStringboolTrue( process.env.OUTPUT_TRACE_LOCAL_ON ),
    name: 'LOCAL',
    init: localProcessor.init,
    exec: localProcessor.exec,
    getDestination: localProcessor.getDestination
  },
  {
    enabled: isStringboolTrue( process.env.OUTPUT_TRACE_REMOTE_ON ),
    name: 'REMOTE',
    init: s3Processor.init,
    exec: s3Processor.exec,
    getDestination: s3Processor.getDestination
  }
];

/**
 * Returns the destinations for a given execution context
 *
 * @param {object} traceInfo - The trace information object
 * @returns {object} A trace destinations object: { [dest-name]: 'path' }
 */
export const getDestinations = traceInfo =>
  processors.reduce( ( o, p ) =>
    Object.assign( o, { [p.name.toLowerCase()]: p.enabled && !traceInfo.disableTrace ? p.getDestination( traceInfo ) : null } )
  , {} );

/**
 * Starts processors based on env vars and attach them to the main bus to listen trace events
 */
export const init = async () => {
  for ( const p of processors.filter( p => p.enabled ) ) {
    await p.init();
    traceBus.addListener( 'entry', async ( ...args ) => {
      try {
        await p.exec( ...args );
      } catch ( error ) {
        log.error( 'Processor execution error', { processor: p.name, error: error.message, stack: error.stack } );
      }
    } );
  }
};

/**
 * Serialize details of an event
 */
const serializeDetails = details => details instanceof Error ? serializeError( details ) : details;

/**
 * Emits an event action to the event bus.
 *
 * @param {string} action - The action
 * @param {object} fields - All the trace fields
 * @returns {void}
 */
export const addEventAction = ( action, { kind, name, id, parentId, details, traceInfo } ) => {
  // Ignores internal steps in the actual trace files, ignore trace if the flag is true
  if ( kind !== ComponentType.INTERNAL_STEP && !traceInfo.disableTrace ) {
    traceBus.emit( 'entry', {
      traceInfo,
      entry: { kind, action, name, id, parentId, timestamp: Date.now(), details: serializeDetails( details ) }
    } );
  }
};

/**
 * Attaches contextual information to an event action before calling the method to emit it to the bus.
 *
 * This function has no effect if called outside a Temporal Workflow/Activity environment,
 * so it is safe to use in unit tests or dependencies that might be used elsewhere.
 *
 * @param {object} options - The common trace configurations
 */
export function addEventActionWithContext( action, options ) {
  const storeContent = Storage.load();
  if ( storeContent ) { // If there is no storageContext this was not called from a Temporal environment
    const { parentId, traceInfo, addAttribute } = storeContent;
    if ( action === EventAction.ADD_ATTR ) {
      const attribute = options.details;
      if ( !( attribute instanceof BaseAttribute ) ) {
        throw new Error( `Event ${EventAction.ADD_ATTR} argument is not a BaseAttribute instance` );
      } else {
        addAttribute( options.details );
      }
    }
    addEventAction( action, { ...options, parentId, traceInfo } );
  }
};
