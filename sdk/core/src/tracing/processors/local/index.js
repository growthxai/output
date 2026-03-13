import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'url';
import buildTraceTree from '../../tools/build_trace_tree.js';
import { EOL } from 'node:os';

const __dirname = dirname( fileURLToPath( import.meta.url ) );

const tempFilesTTL = 1000 * 60 * 60 * 24 * 7; // 1 week in milliseconds

// Retrieves the caller path from the standard args used to start workflows
const callerDir = process.argv[2];

const tempTraceFilesDir = join( __dirname, 'temp', 'traces' );

const accumulate = ( { entry, executionContext: { workflowId, startTime } } ) => {
  const path = join( tempTraceFilesDir, `${startTime}_${workflowId}.trace` );
  appendFileSync( path, JSON.stringify( entry ) + EOL, 'utf-8' );
  return readFileSync( path, 'utf-8' ).split( EOL ).slice( 0, -1 ).map( v => JSON.parse( v ) );
};

const cleanupOldTempFiles = ( threshold = Date.now() - tempFilesTTL ) =>
  readdirSync( tempTraceFilesDir )
    .filter( f => +f.split( '_' )[0] < threshold )
    .forEach( f => rmSync( join( tempTraceFilesDir, f ) ) );

/**
 * Resolves the deep folder structure that stores a workflow trace.
 * @param {string} workflowName - Name of the workflow
 * @returns {string}
 */
const resolveTraceFolder = workflowName => join( 'runs', workflowName );

/**
 * Resolves the local file system path for ALL file I/O operations (read/write)
 * Uses the project root path
 * @param {string} workflowName - The name of the workflow
 * @returns {string} The local filesystem path for file operations
 */
const resolveIOPath = workflowName => join( callerDir, 'logs', resolveTraceFolder( workflowName ) );

/**
 * Resolves the file path to be reported as the trace destination.
 *
 * Considering that in containerized environments (e.g., Docker), the file path might differ from the host machine,
 * this value takes in consideration the OUTPUT_TRACE_HOST_PATH env variable instead of the local filesystem to mount
 * the final file path.
 *
 * If the env variable is not present, it falls back to the same value used to write files locally.
 *
 * @param {string} workflowName - The name of the workflow
 * @returns {string} The path to report, reflecting the actual filesystem
 */
const resolveReportPath = workflowName => process.env.OUTPUT_TRACE_HOST_PATH ?
  join( process.env.OUTPUT_TRACE_HOST_PATH, resolveTraceFolder( workflowName ) ) :
  resolveIOPath( workflowName );

/**
 * Builds the actual trace filename
 *
 * @param {object} options
 * @param {number} options.startTime
 * @param {string} options.workflowId
 * @returns {string}
 */
const buildTraceFilename = ( { startTime, workflowId } ) => {
  const timestamp = new Date( startTime ).toISOString().replace( /[:T.]/g, '-' );
  return `${timestamp}_${workflowId}.json`;
};

/**
 * Init this processor
 */
export const init = () => {
  mkdirSync( tempTraceFilesDir, { recursive: true } );
  cleanupOldTempFiles();
};

/**
 * Execute this processor:
 *
 * Persist a trace tree file to local file system, updating upon each new entry
 *
 * @param {object} args
 * @param {object} entry - Trace event phase
 * @param {object} executionContext - Execution info: workflowId, workflowName, startTime
 * @returns {void}
 */
export const exec = ( { entry, executionContext } ) => {
  const { workflowId, workflowName, startTime } = executionContext;
  const content = buildTraceTree( accumulate( { entry, executionContext } ) );
  const dir = resolveIOPath( workflowName );
  const path = join( dir, buildTraceFilename( { startTime, workflowId } ) );

  mkdirSync( dir, { recursive: true } );
  writeFileSync( path, JSON.stringify( content, undefined, 2 ) + EOL, 'utf-8' );
};

/**
 * Returns where the trace is saved as an absolute path.
 *
 * This uses the optional OUTPUT_TRACE_HOST_PATH to return values relative to the host OS, not the container, if applicable.
 *
 * @param {object} executionContext
 * @param {string} executionContext.startTime - The start time of the workflow
 * @param {string} executionContext.workflowId - The id of the workflow execution
 * @param {string} executionContext.workflowName - The name of the workflow
 * @returns {string} The absolute path where the trace will be saved
 */
export const getDestination = ( { startTime, workflowId, workflowName } ) =>
  join( resolveReportPath( workflowName ), buildTraceFilename( { workflowId, startTime } ) );
