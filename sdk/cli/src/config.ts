export const config = {
  get apiUrl() {
    return process.env.OUTPUT_API_URL || `http://localhost:${process.env.OUTPUT_API_HOST_PORT ?? '3001'}`;
  },
  get ports() {
    return {
      temporal: parseInt( process.env.OUTPUT_TEMPORAL_HOST_PORT ?? '7233', 10 ),
      temporalUi: parseInt( process.env.OUTPUT_TEMPORAL_UI_HOST_PORT ?? '8080', 10 ),
      api: parseInt( process.env.OUTPUT_API_HOST_PORT ?? '3001', 10 )
    };
  },
  get temporalUiUrl() {
    return `http://localhost:${process.env.OUTPUT_TEMPORAL_UI_HOST_PORT ?? '8080'}`;
  },
  get apiToken() {
    return process.env.OUTPUT_API_AUTH_TOKEN;
  },
  requestTimeout: 30000,
  get dockerServiceName() {
    return process.env.DOCKER_SERVICE_NAME || 'output-sdk';
  },
  get debugMode() {
    return process.env.OUTPUT_DEBUG === 'true';
  },
  get envFile() {
    return process.env.OUTPUT_CLI_ENV || '.env';
  },
  agentConfigDir: '.outputai',
  get s3() {
    return {
      bucket: process.env.OUTPUT_TRACE_REMOTE_S3_BUCKET,
      region: process.env.OUTPUT_AWS_REGION,
      accessKeyId: process.env.OUTPUT_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.OUTPUT_AWS_SECRET_ACCESS_KEY
    };
  }
};
