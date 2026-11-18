import { upload } from './s3_client.js';
import { getRedisClient } from './redis_client.js';
import buildTraceTree from '../../tools/build_trace_tree.js';
import { loadEnv, getVars } from './configs.js';
import { createChildLogger } from '#logger';
import { JsonStreamStringify } from 'json-stream-stringify';

const log = createChildLogger( 'S3 Processor' );

const createRedisKey = runId => `traces/${runId}`;

/**
 * Add new entry to list of entries
 * @param {object} entry
 * @param {string} key
 */
const addEntry = async ( entry, key ) => {
  const client = await getRedisClient();
  await client.multi()
    .zAdd( key, [ { score: entry.timestamp, value: JSON.stringify( entry ) } ], { NX: true } )
    .expire( key, getVars().redisIncompleteWorkflowsTTL )
    .exec();
};

/**
 * Returns entries from cache, parsed to object
 * @param {string} key
 * @returns {object[]}
 */
const getEntries = async key => {
  const client = await getRedisClient();
  const zList = await client.zRange( key, 0, -1 );
  return zList.map( v => JSON.parse( v ) );
};

/**
 * Removes the entries from cache
 * @param {string} key
 */
const bustEntries = async key => {
  const client = await getRedisClient();
  await client.del( key );
};

/**
 * Return the S3 key for the trace file
 * @param {object} traceInfo
 * @returns
 */
const getS3Key = ( { startTime, workflowId, workflowType } ) => {
  const isoDate = new Date( startTime ).toISOString();
  const [ year, month, day ] = isoDate.split( /\D/, 3 );
  const timeStamp = isoDate.replace( /[:T.]/g, '-' );
  return `${workflowType}/${year}/${month}/${day}/${timeStamp}_${workflowId}.json`;
};

/**
 * Init this processor
 */
export const init = async () => {
  loadEnv();
  await getRedisClient();
};

/**
 * Execute this processor:
 *
 * Appends each trace entry to Redis.
 *
 * When the root workflow finishes or errors, builds the trace tree and uploads it to S3.
 *
 * @param {object} args
 * @param {object} args.entry - The trace entry to append
 * @param {object} args.traceInfo - Trace information object
 */
export const exec = async ( { entry, traceInfo } ) => {
  const { workflowId, runId } = traceInfo;
  const cacheKey = createRedisKey( runId );

  await addEntry( entry, cacheKey );

  const isRootWorkflowEnd = entry.id === runId && entry.action !== 'start';
  if ( !isRootWorkflowEnd ) {
    return;
  }

  // Wait for straggler entries from other workers to land in Redis before uploading
  const delayMs = getVars().traceUploadDelayMs;
  if ( delayMs > 0 ) {
    await new Promise( resolve => setTimeout( resolve, delayMs ) );
  }

  const content = buildTraceTree( await getEntries( cacheKey ) );
  // if the trace tree is incomplete it will return null, in this case we can safely discard
  if ( !content ) {
    log.warn( 'Incomplete trace file discarded', { workflowId, error: 'incomplete_trace_file' } );
    return;
  }

  await upload( { key: getS3Key( traceInfo ), content: new JsonStreamStringify( content ) } );
  await bustEntries( cacheKey );
};

/**
 * Returns where the trace is saved
 * @param {object} traceInfo - Trace information object
 * @returns {string} The S3 url of the trace file
 */
export const getDestination = traceInfo => `https://${getVars().remoteS3Bucket}.s3.amazonaws.com/${getS3Key( traceInfo )}`;
