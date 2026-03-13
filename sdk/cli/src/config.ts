/**
 * CLI configuration
 */
export const config = {
  /**
   * Base URL for the Output.ai API server
   * Can be overridden with OUTPUT_API_URL environment variable
   */
  apiUrl: process.env.OUTPUT_API_URL || 'http://localhost:3001',

  /**
   * API authentication token
   * Set via OUTPUT_API_AUTH_TOKEN environment variable
   */
  apiToken: process.env.OUTPUT_API_AUTH_TOKEN,

  /**
   * Default timeout for API requests (in milliseconds)
   */
  requestTimeout: 30000,

  /**
   * Docker Compose project name
   * Can be overridden with DOCKER_SERVICE_NAME environment variable
   */
  dockerServiceName: process.env.DOCKER_SERVICE_NAME || 'output-sdk',

  /**
   * Set the debug mode
   */
  debugMode: process.env.OUTPUT_DEBUG === 'true',

  /**
   * Where the env vars are stored, defaults to `.env`
   */
  envFile: process.env.OUTPUT_CLI_ENV || '.env',

  /**
   * Agent configuration directory name
   */
  agentConfigDir: '.outputai',

  /**
   * S3 configuration for remote trace storage
   * Set via OUTPUT_TRACE_REMOTE_S3_BUCKET, OUTPUT_AWS_REGION,
   * OUTPUT_AWS_ACCESS_KEY_ID, and OUTPUT_AWS_SECRET_ACCESS_KEY environment variables
   */
  s3: {
    bucket: process.env.OUTPUT_TRACE_REMOTE_S3_BUCKET,
    region: process.env.OUTPUT_AWS_REGION,
    accessKeyId: process.env.OUTPUT_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.OUTPUT_AWS_SECRET_ACCESS_KEY
  }
};
