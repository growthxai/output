import { Storage } from '#async_storage';
import { EventEmitter } from 'node:events';
import { serializeError } from './tools/utils.js';
import { isStringboolTrue } from '#utils';
import * as localProcessor from './processors/local/index.js';
import * as s3Processor from './processors/s3/index.js';
import { ComponentType } from '#consts';
import { createChildLogger } from '#logger';

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
 * @param {object} executionContext
 * @param {string} executionContext.startTime
 * @param {string} executionContext.workflowId
 * @param {string} executionContext.workflowName
 * @param {boolean} executionContext.disableTrace
 * @returns {object} A trace destinations object: { [dest-name]: 'path' }
 */
export const getDestinations = executionContext =>
  processors.reduce( ( o, p ) =>
    Object.assign( o, { [p.name.toLowerCase()]: p.enabled && !executionContext.disableTrace ? p.getDestination( executionContext ) : null } )
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
 * Creates a new trace event phase and sends it to be written
 *
 * @param {string} phase - The phase
 * @param {object} fields - All the trace fields
 * @returns {void}
 */
export const addEventPhase = ( phase, { kind, name, id, parentId, details, executionContext } ) => {
  // Ignores internal steps in the actual trace files, ignore trace if the flag is true
  if ( kind !== ComponentType.INTERNAL_STEP && !executionContext.disableTrace ) {
    traceBus.emit( 'entry', {
      executionContext,
      entry: { kind, phase, name, id, parentId, timestamp: Date.now(), details: serializeDetails( details ) }
    } );
  }
};

/**
 * Adds an Event Phase, complementing the options with parentId and executionContext from the async storage.
 *
 * This function will have no effect if called from outside an Temporal Workflow/Activity environment,
 * so it is safe to be used on unit tests or any dependencies that might be used elsewhere
 *
 * @param {object} options - The common trace configurations
 */
export function addEventPhaseWithContext( phase, options ) {
  const storeContent = Storage.load();
  if ( storeContent ) { // If there is no storageContext this was not called from an Temporal Environment
    const { parentId, executionContext } = storeContent;
    addEventPhase( phase, { ...options, parentId, executionContext } );
  }
};
