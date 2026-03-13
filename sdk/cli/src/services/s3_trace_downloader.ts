import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import type { TraceData } from '#types/trace.js';
import { config } from '#config.js';

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface RemoteTraceInfo {
  key: string;
  lastModified?: Date;
  size?: number;
}

function getS3Config(): S3Config {
  const { bucket, region, accessKeyId, secretAccessKey } = config.s3;

  if ( !bucket || !region || !accessKeyId || !secretAccessKey ) {
    throw new Error(
      'Missing S3 configuration. Set OUTPUT_TRACE_REMOTE_S3_BUCKET, OUTPUT_AWS_REGION, ' +
      'OUTPUT_AWS_ACCESS_KEY_ID, and OUTPUT_AWS_SECRET_ACCESS_KEY environment variables.'
    );
  }

  return { bucket, region, accessKeyId, secretAccessKey };
}

function createS3Client( s3Config: S3Config ): S3Client {
  return new S3Client( {
    region: s3Config.region,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey
    }
  } );
}

export async function listRemoteTraces(
  workflowName: string,
  options: { limit?: number; since?: Date } = {}
): Promise<RemoteTraceInfo[]> {
  const s3Config = getS3Config();
  const client = createS3Client( s3Config );
  const limit = options.limit ?? 20;

  const command = new ListObjectsV2Command( {
    Bucket: s3Config.bucket,
    Prefix: `${workflowName}/`,
    MaxKeys: limit
  } );

  const response = await client.send( command );
  const contents = response.Contents ?? [];

  return contents
    .filter( obj => {
      if ( !obj.Key ) {
        return false;
      }
      if ( options.since && obj.LastModified && obj.LastModified < options.since ) {
        return false;
      }
      return true;
    } )
    .map( obj => ( {
      key: obj.Key!,
      lastModified: obj.LastModified,
      size: obj.Size
    } ) );
}

export async function downloadRemoteTrace(
  key: string
): Promise<TraceData> {
  const s3Config = getS3Config();
  const client = createS3Client( s3Config );

  const command = new GetObjectCommand( { Bucket: s3Config.bucket, Key: key } );
  const response = await client.send( command );

  const body = await response.Body?.transformToString();
  if ( !body ) {
    throw new Error( `Empty response for S3 object: ${key}` );
  }

  return JSON.parse( body ) as TraceData;
}
