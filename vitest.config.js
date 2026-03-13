import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig( {
  plugins: [ tsconfigPaths() ],
  test: {
    silent: true,
    environment: 'node',
    include: [ '**/?(*.)+(spec|test).(ts|js)' ],
    exclude: [ 'node_modules/**', '**/node_modules/**', '**/*.integration.test.(ts|js)', '**/dist/**' ],
    globals: true,
    sourcemap: true // Enable source maps for debugging
  }
} );
