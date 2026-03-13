import * as z from 'zod';

const envVarSchema = z.object( {
  OUTPUT_AWS_REGION: z.string(),
  OUTPUT_AWS_ACCESS_KEY_ID: z.string(),
  OUTPUT_AWS_SECRET_ACCESS_KEY: z.string(),
  OUTPUT_TRACE_REMOTE_S3_BUCKET: z.string(),
  OUTPUT_REDIS_URL: z.string(),
  OUTPUT_REDIS_TRACE_TTL: z.coerce.number().int().positive().default( 60 * 60 * 24 * 7 ), // 7 days
  OUTPUT_TRACE_UPLOAD_DELAY_MS: z.coerce.number().int().nonnegative().default( 10_000 ) // 10s
} );

const env = {};

export const loadEnv = () => {
  const parsedFields = envVarSchema.parse( process.env );
  env.awsRegion = parsedFields.OUTPUT_AWS_REGION;
  env.awsAccessKeyId = parsedFields.OUTPUT_AWS_ACCESS_KEY_ID;
  env.awsSecretAccessKey = parsedFields.OUTPUT_AWS_SECRET_ACCESS_KEY;
  env.remoteS3Bucket = parsedFields.OUTPUT_TRACE_REMOTE_S3_BUCKET;
  env.redisUrl = parsedFields.OUTPUT_REDIS_URL;
  env.redisIncompleteWorkflowsTTL = parsedFields.OUTPUT_REDIS_TRACE_TTL;
  env.traceUploadDelayMs = parsedFields.OUTPUT_TRACE_UPLOAD_DELAY_MS;
};

export const getVars = () => {
  if ( Object.keys( env ).length === 0 ) {
    throw new Error( 'Env vars not loaded. Use loadEnv() first.' );
  }
  return env;
};
