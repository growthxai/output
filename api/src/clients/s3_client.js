/**
 * S3 client for fetching trace files from remote S3 storage
 * Uses AWS SDK default credential chain for authentication
 */

import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { parseS3Url } from '#utils';
import { aws as awsConfig } from '#configs';
import { TraceFileDownloadError, TraceFileParseError, TraceFileTooLargeError } from './errors.js';

/** Hard cap, in bytes, for a trace file served inline. Bigger files are only reachable through a signed URL. */
const maxTraceSizeBytes = 256 * 1024 * 1024;

const downloadUrlTtlSeconds = 15 * 60;

async function parseTraceFile( { response: s3Response, url } ) {
  const content = await s3Response.Body.transformToString();

  try {
    return JSON.parse( content );
  } catch ( error ) {
    throw new TraceFileParseError( 'Invalid trace file', url, error );
  }
}

const createClient = region => {
  if ( !awsConfig.accessKeyId || !awsConfig.secretAccessKey ) {
    throw new TraceFileDownloadError( 'Missing AWS keys to authenticate' );
  }

  return new S3Client( {
    region: region ?? awsConfig.region,
    credentials: {
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey
    }
  } );
};

const sendCommand = async ( { client, command, url, failureMessage } ) => {
  try {
    return await client.send( command );
  } catch ( error ) {
    throw new TraceFileDownloadError( failureMessage, url, error );
  }
};

const createDownloadUrl = async ( { client, bucket, key, url } ) => {
  try {
    return await getSignedUrl( client, new GetObjectCommand( { Bucket: bucket, Key: key } ), { expiresIn: downloadUrlTtlSeconds } );
  } catch ( error ) {
    throw new TraceFileDownloadError( 'S3 presign failure', url, error );
  }
};

/**
 * Fetch trace file content from S3 URL and parse as JSON
 *
 * The object size is checked first. A file above `maxTraceSizeBytes` is never read: the error carries a
 * signed URL so the caller can fetch it directly from S3.
 *
 * @param {string} url - S3 HTTPS URL to fetch trace from
 * @returns {Promise<object>} Parsed JSON trace data
 * @throws {InvalidTraceFileUrl} When URL is invalid
 * @throws {TraceFileTooLargeError} When the file is bigger than `maxTraceSizeBytes`
 * @throws {TraceFileDownloadError} When S3 access fails or JSON parsing fails
 */
export async function fetchTraceFromS3( url ) {
  const { bucket, key, region } = parseS3Url( url );
  const client = createClient( region );

  const { ContentLength: size } = await sendCommand( {
    client,
    command: new HeadObjectCommand( { Bucket: bucket, Key: key } ),
    url,
    failureMessage: 'S3 HeadObject failure'
  } );

  if ( size > maxTraceSizeBytes ) {
    const expiresAt = new Date( Date.now() + ( downloadUrlTtlSeconds * 1000 ) ).toISOString();
    throw new TraceFileTooLargeError( {
      url,
      size,
      maxSize: maxTraceSizeBytes,
      downloadUrl: await createDownloadUrl( { client, bucket, key, url } ),
      expiresAt
    } );
  }

  const response = await sendCommand( {
    client,
    command: new GetObjectCommand( { Bucket: bucket, Key: key } ),
    url,
    failureMessage: 'S3 GetObject failure'
  } );

  return parseTraceFile( { response, url } );
}
