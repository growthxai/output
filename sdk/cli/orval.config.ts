import { defineConfig } from 'orval';
import { fixEsmImports, runEslintFix } from './src/api/orval_post_process.js';

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
    },
    hooks: {
      afterAllFilesWrite: async _ => {
        await fixEsmImports( './src/api/generated/api.ts' );
        await runEslintFix();
      }
    }
  }
} );
