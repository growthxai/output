import { upload } from './s3_client.js';
import { getRedisClient } from './redis_client.js';
import buildTraceTree from '../../tools/build_trace_tree.js';
import { EOL } from 'node:os';
import { loadEnv, getVars } from './configs.js';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'S3 Processor' );

const createRedisKey = ( { workflowId, workflowName } ) => `traces/${workflowName}/${workflowId}`;

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
 * @param {object} args
 * @param {number} args.startTime
 * @param {string} args.workflowId
 * @param {string} args.workflowName
 * @returns
 */
const getS3Key = ( { startTime, workflowId, workflowName } ) => {
  const isoDate = new Date( startTime ).toISOString();
  const [ year, month, day ] = isoDate.split( /\D/, 3 );
  const timeStamp = isoDate.replace( /[:T.]/g, '-' );
  return `${workflowName}/${year}/${month}/${day}/${timeStamp}_${workflowId}.json`;
};

/**
 * Init this processor
 */
export const init = async () => {
  loadEnv();
  await getRedisClient();
};

/**
 * Execute this processor: send a complete trace tree file to S3 when the workflow finishes
 *
 * @param {object} args
 * @param {object} entry - Trace event phase
 * @param {object} executionContext - Execution info: workflowId, workflowName, startTime
 */
export const exec = async ( { entry, executionContext } ) => {
  const { workflowName, workflowId, startTime } = executionContext;
  const cacheKey = createRedisKey( { workflowId, workflowName } );

  await addEntry( entry, cacheKey );

  const isRootWorkflowEnd = entry.id === workflowId && entry.phase !== 'start';
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
  await upload( {
    key: getS3Key( { workflowId, workflowName, startTime } ),
    content: JSON.stringify( content, undefined, 2 ) + EOL
  } );
  await bustEntries( cacheKey );
};

/**
 * Returns where the trace is saved
 * @param {object} executionContext
 * @param {string} executionContext.startTime - The start time of the workflow
 * @param {string} executionContext.workflowId - The id of the workflow execution
 * @param {string} executionContext.workflowName - The name of the workflow
 * @returns {string} The S3 url of the trace file
 */
export const getDestination = ( { startTime, workflowId, workflowName } ) =>
  `https://${getVars().remoteS3Bucket}.s3.amazonaws.com/${getS3Key( { workflowId, workflowName, startTime } )}`;
