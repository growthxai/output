import { defineConfig } from 'vitest/config';

export default defineConfig( {
  resolve: {
    tsconfigPaths: true
  },
  test: {
    silent: true,
    environment: 'node',
    include: [ '**/?(*.)+(spec|test).(ts|js)' ],
    exclude: [ 'node_modules/**', '**/node_modules/**', '**/*.integration.test.(ts|js)', '**/dist/**' ],
    globals: true,
    sourcemap: true // Enable source maps for debugging
  }
} );
