#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const specFile = join( __dirname, '..', 'openapi.yml' );
const outputFile = join( __dirname, '..', 'openapi.json' );

console.log( '\x1b[0;34m%s\x1b[0m', '[API]: Convert OpenAPI yml to json' );

if ( !existsSync( specFile ) ) {
  console.error( `Missing source file ${specFile}` );
  process.exit( 1 );
}

// eslint-disable-next-line consistent-return
const spec = ( () => {
  try {
    return yaml.load( readFileSync( specFile, 'utf8' ) );
  } catch ( error ) {
    console.error( `Invalid yml file ${specFile}: ${error.message}` );
    process.exit( 1 );
  }
} )();

if ( !/^3\.0\.\d+$/.test( spec?.openapi ) ) {
  console.error( `Invalid spec at ${specFile}: Must be a valid openapi 3.0.x spec` );
  process.exit( 1 );
}

// Production has basic auth, dev don't
spec.security = process.env.NODE_ENV === 'production' ? [ { BasicAuth: [] } ] : [];

writeFileSync( outputFile, JSON.stringify( spec, null, 2 ) + '\n', 'utf-8' );

console.log( '\x1b[0;32m%s\x1b[0m', 'OpenAPI json created' );
