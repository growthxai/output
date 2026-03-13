import * as z from 'zod';

class InvalidEnvVarsErrors extends Error { }

export const isProduction = process.env.NODE_ENV === 'production';

const envSchema = z.object( {
  NODE_ENV: z.string().optional().default( 'development' ),
  TEMPORAL_ADDRESS: z.string().optional().default( 'localhost:7233' ),
  TEMPORAL_NAMESPACE: z.string().optional().default( 'default' ),
  TEMPORAL_WORKFLOW_EXECUTION_TIMEOUT: z.string().optional().default( '24h' ),
  TEMPORAL_WORKFLOW_EXECUTION_MAX_WAITING: z.coerce.number().optional().default( 300_000 ), // 5minutes
  TEMPORAL_API_KEY: z.string().optional(),
  OUTPUT_API_PORT: z.coerce.number().optional().default( 3000 ),
  OUTPUT_API_SERVICE_NAME: z.string().optional().default( 'output-api' ),
  OUTPUT_CATALOG_ID: z.string().regex( /^[a-z0-9_.@-]+$/i ),
  OUTPUT_API_AUTH_TOKEN: z.string().optional(),
  OUTPUT_AWS_REGION: z.string().optional().default( 'us-west-1' ),
  OUTPUT_AWS_ACCESS_KEY_ID: z.string().optional(),
  OUTPUT_AWS_SECRET_ACCESS_KEY: z.string().optional(),
  ...( isProduction && {
    OUTPUT_API_AUTH_TOKEN: z.string()
  } )
} );

const { data: safeEnvVar, error } = envSchema.safeParse( process.env );
if ( error ) {
  throw new InvalidEnvVarsErrors( z.prettifyError( error ) );
}

export const temporal = {
  defaultTaskQueue: safeEnvVar.OUTPUT_CATALOG_ID,
  address: safeEnvVar.TEMPORAL_ADDRESS,
  apiKey: safeEnvVar.TEMPORAL_API_KEY,
  namespace: safeEnvVar.TEMPORAL_NAMESPACE,
  workflowExecutionTimeout: safeEnvVar.TEMPORAL_WORKFLOW_EXECUTION_TIMEOUT,
  workflowExecutionMaxWaiting: safeEnvVar.TEMPORAL_WORKFLOW_EXECUTION_MAX_WAITING
};

export const api = {
  authToken: safeEnvVar.OUTPUT_API_AUTH_TOKEN,
  defaultCatalogWorkflow: safeEnvVar.OUTPUT_CATALOG_ID,
  port: safeEnvVar.OUTPUT_API_PORT,
  serviceName: safeEnvVar.OUTPUT_API_SERVICE_NAME,
  nodeEnv: safeEnvVar.NODE_ENV
};

export const aws = {
  region: safeEnvVar.OUTPUT_AWS_REGION,
  accessKeyId: safeEnvVar.OUTPUT_AWS_ACCESS_KEY_ID,
  secretAccessKey: safeEnvVar.OUTPUT_AWS_SECRET_ACCESS_KEY
};
