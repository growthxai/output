import { defineConfig } from 'orval';

export default defineConfig( {
  outputapi: {
    input: {
      target: '../../api/openapi.json'
    },
    output: {
      mode: 'single',
      target: './src/api/generated/api.ts',
      client: 'fetch',
      override: {
        mutator: {
          path: './src/api/http_client.ts',
          name: 'customFetchInstance'
        }
      }
    }
  }
} );
