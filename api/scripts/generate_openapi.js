#!/usr/bin/env node

import swaggerJsdoc from 'swagger-jsdoc';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const specsFile = join( __dirname, '..', 'src', 'index.js' );
const outputFile = join( __dirname, '..', 'openapi.json' );

console.log( '\x1b[0;34m%s\x1b[0m', '[API]: Generating OpenAPI spec JSON' );

const spec = swaggerJsdoc( {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Output.ai API',
      version: '1.0.0',
      description: 'API for managing and executing Output.ai workflows'
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        BasicAuth: {
          type: 'http',
          scheme: 'basic'
        }
      }
    },
    security: process.env.NODE_ENV === 'production' ? [ { BasicAuth: [] } ] : []
  },
  apis: [ specsFile ]
} );

writeFileSync( outputFile, JSON.stringify( spec, null, 2 ) + '\n', 'utf-8' );

console.log( '\x1b[0;32m%s\x1b[0m', 'OpenAPI json created' );
