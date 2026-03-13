import { defineConfig } from 'vitest/config';

export default defineConfig( {
  test: {
    environment: 'node',
    include: [ '**/*.integration.test.(ts|js)' ],
    exclude: [ 'node_modules/**', '**/node_modules/**' ],
    globals: true
  }
} );
