import { parsePort } from '#utils/validation.js';

const DEFAULT_API_PORT = 3001;
const DEFAULT_TEMPORAL_UI_PORT = 8080;
const DEFAULT_TEMPORAL_PORT = 7233;

export const config = {
  get apiUrl() {
    return process.env.OUTPUT_API_URL || `http://localhost:${this.ports.api}`;
  },
  get ports() {
    return {
      temporalUi: parsePort( process.env.OUTPUT_TEMPORAL_UI_HOST_PORT, DEFAULT_TEMPORAL_UI_PORT, 'OUTPUT_TEMPORAL_UI_HOST_PORT' ),
      temporal: parsePort( process.env.OUTPUT_TEMPORAL_HOST_PORT, DEFAULT_TEMPORAL_PORT, 'OUTPUT_TEMPORAL_HOST_PORT' ),
      api: parsePort( process.env.OUTPUT_API_HOST_PORT, DEFAULT_API_PORT, 'OUTPUT_API_HOST_PORT' )
    };
  },
  get temporalUiUrl() {
    return `http://localhost:${this.ports.temporalUi}`;
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
  agentConfigDir: '.outputai'
};
