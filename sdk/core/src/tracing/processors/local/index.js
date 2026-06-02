import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'url';
import buildTraceTree from '../../tools/build_trace_tree.js';
import { EOL } from 'node:os';
import { JsonStreamStringify } from 'json-stream-stringify';

import { pipeline } from 'stream/promises';

const __dirname = dirname( fileURLToPath( import.meta.url ) );

const tempFilesTTL = 1000 * 60 * 60 * 24 * 7; // 1 week in milliseconds

// Retrieves the caller path from the standard args used to start workflows
const callerDir = process.argv[2];

const tempTraceFilesDir = join( __dirname, 'temp', 'traces' );

/**
 * Builds the temp file path to accumulate trace entries
 *
 * @param {object} traceInfo - Trace information object
 * @returns {string}
 */
const createTempFilePath = ( { startTime, runId } ) => join( tempTraceFilesDir, `${startTime}_${runId}.trace` );

/**
 * Adds a trace entry to the accumulation file.
 * @param {object} entry - The trace entry
 * @param {string} path - Accumulation file path
 */
const addEntry = ( entry, path ) => appendFileSync( path, JSON.stringify( entry ) + EOL, 'utf-8' );

/**
 * Reads the accumulation file and returns all the entries, each serialized to JSON
 * @param {string} path - Accumulation file path
 * @returns {object[]} Trace entries
 */
const getEntries = path => readFileSync( path, 'utf-8' ).split( EOL ).slice( 0, -1 ).map( v => JSON.parse( v ) );

/**
 * Deletes old accumulation files
 * @param {number} [threshold] Timestamp in ms epoch. All files below this date are considered old
 */
const cleanupOldTempFiles = ( threshold = Date.now() - tempFilesTTL ) =>
  readdirSync( tempTraceFilesDir )
    .filter( f => +f.split( '_' )[0] < threshold )
    .forEach( f => rmSync( join( tempTraceFilesDir, f ) ) );

/**
 * Resolves the deep folder structure that stores a workflow trace.
 * @param {string} workflowType
 * @returns {string}
 */
const resolveTraceFolder = workflowType => join( 'runs', workflowType );

/**
 * Resolves the local file system path for ALL file I/O operations (read/write)
 * Uses the project root path
 * @param {string} workflowType
 * @returns {string} The local filesystem path for file operations
 */
const resolveIOPath = workflowType => join( callerDir, 'logs', resolveTraceFolder( workflowType ) );

/**
 * Resolves the file path to be reported as the trace destination.
 *
 * Considering that in containerized environments (e.g., Docker), the file path might differ from the host machine,
 * this value takes in consideration the OUTPUT_TRACE_HOST_PATH env variable instead of the local filesystem to mount
 * the final file path.
 *
 * If the env variable is not present, it falls back to the same value used to write files locally.
 *
 * @param {string} workflowType - The name of the workflow
 * @returns {string} The path to report, reflecting the actual filesystem
 */
const resolveReportPath = workflowType => process.env.OUTPUT_TRACE_HOST_PATH ?
  join( process.env.OUTPUT_TRACE_HOST_PATH, resolveTraceFolder( workflowType ) ) :
  resolveIOPath( workflowType );

/**
 * Builds the actual trace filename
 *
 * @param {object} traceInfo - The trace information object
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
 * Appends each trace entry to a temp file.
 *
 * When the root workflow ends or the entry is an error action, build the trace tree and write the JSON file.
 *
 * @param {object} args
 * @param {object} args.entry - The trace entry to append.
 * @param {object} args.traceInfo - Trace information object
 * @returns {void}
 */
export const exec = async ( { entry, traceInfo } ) => {
  const { runId, workflowType } = traceInfo;
  const tempFilePath = createTempFilePath( traceInfo );
  addEntry( entry, tempFilePath );

  const isRootWorkflowEnd = entry.id === runId && entry.action !== 'start';
  const isError = entry.action === 'error';

  if ( !isRootWorkflowEnd && !isError ) {
    return;
  }

  const content = buildTraceTree( getEntries( tempFilePath ) );
  const dir = resolveIOPath( workflowType );
  const path = join( dir, buildTraceFilename( traceInfo ) );

  mkdirSync( dir, { recursive: true } );

  await pipeline(
    new JsonStreamStringify( content ),
    createWriteStream( path )
  );
};

/**
 * Returns where the trace is saved as an absolute path.
 *
 * This uses the optional OUTPUT_TRACE_HOST_PATH to return values relative to the host OS, not the container, if applicable.
 *
 * @param {object} info
 * @returns {string} The absolute path where the trace will be saved
 */
export const getDestination = traceInfo =>
  join( resolveReportPath( traceInfo.workflowType ), buildTraceFilename( traceInfo ) );
