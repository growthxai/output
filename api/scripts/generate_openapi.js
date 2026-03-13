#!/usr/bin/env node

import swaggerJsdoc from 'swagger-jsdoc';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath( import.meta.url );
const __dirname = dirname( __filename );

const options = {
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
  apis: [ join( __dirname, '..', 'src', 'api.js' ) ]
};

const openapiSpecification = swaggerJsdoc( options );

const json = JSON.stringify( openapiSpecification, null, 2 ) + '\n';

const outputPaths = [
  join( __dirname, '..', 'openapi.json' ),
  join( __dirname, '..', '..', 'docs', 'guides', 'openapi.json' )
];

outputPaths.forEach( p => {
  writeFileSync( p, json );
  console.log( `✅ OpenAPI specification generated at: ${p}` );
} );

export default openapiSpecification;
