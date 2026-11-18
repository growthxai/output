import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getVars } from './configs.js';

const state = { s3Client: null };

/**
 * Return a S3 Client instance
 * @returns {S3Client}
 */
const getS3Client = () => {
  if ( state.s3Client ) {
    return state.s3Client;
  }

  const { awsRegion: region, awsSecretAccessKey: secretAccessKey, awsAccessKeyId: accessKeyId } = getVars();

  return state.s3Client = new S3Client( { region, credentials: { accessKeyId, secretAccessKey } } );
};

/**
 * Upload given file to S3
 * @param {object} args
 * @param {string} key - S3 file key
 * @param {string|import('node:stream').Readable} content - File content
 */
export const upload = ( { key, content } ) =>
  new Upload( {
    client: getS3Client(),
    params: {
      Bucket: getVars().remoteS3Bucket,
      Key: key,
      Body: content
    }
  } ).done();
