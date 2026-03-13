/**
 * S3 client for fetching trace files from remote S3 storage
 * Uses AWS SDK default credential chain for authentication
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { parseS3Url } from '#utils';
import { aws as awsConfig } from '#configs';
import { TraceFileDownloadError, TraceFileParseError } from './errors.js';

async function parseTraceFile( { response: s3Response, url } ) {
  const content = await s3Response.Body.transformToString();

  try {
    return JSON.parse( content );
  } catch ( error ) {
    throw new TraceFileParseError( 'Invalid trace file', url, error );
  }
}

const download = async ( { bucket, key, region, url } ) => {
  if ( !awsConfig.accessKeyId || !awsConfig.secretAccessKey ) {
    throw new TraceFileDownloadError( 'Missing AWS keys to authenticate' );
  }
  const args = {
    region: region ?? awsConfig.region,
    credentials: {
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey
    }
  };

  try {
    const client = new S3Client( args );
    const command = new GetObjectCommand( { Bucket: bucket, Key: key } );
    return await client.send( command );
  } catch ( error ) {
    throw new TraceFileDownloadError( 'S3 GetObject failure', url, error );
  }
};

/**
 * Fetch trace file content from S3 URL and parse as JSON
 * @param {string} url - S3 HTTPS URL to fetch trace from
 * @returns {Promise<object>} Parsed JSON trace data
 * @throws {InvalidTraceFileUrl} When URL is invalid
 * @throws {TraceFileDownloadError} When S3 access fails or JSON parsing fails
 */
export async function fetchTraceFromS3( url ) {
  const response = await download( { ...parseS3Url( url ), url } );

  return parseTraceFile( { response, url } );
}
