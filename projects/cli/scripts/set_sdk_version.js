#!/usr/bin/env node
/**
 * Writes the given version into framework_version.json and docker-compose-dev.yml
 * (OUTPUT_API_VERSION default). Pass version as first arg, e.g. v0.1.0 or 0.1.0.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

console.log( '\x1b[0;36m%s\x1b[0m', '[CLI]: Set SDK version' );

const version = process.argv[2]?.trim();
if ( !version ) {
  console.error( 'Missing version argument' );
  process.exit( 1 );
}

console.log( `- New version: ${version}` );

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const src = join( __dirname, '..', 'src' );

const dockerComposeFilename = join( src, 'assets', 'docker', 'docker-compose-dev.yml' );
const frameworkVersionFilename = join( src, 'generated', 'framework_version.json' );

if ( !existsSync( frameworkVersionFilename ) ) {
  console.error( `Missing file ${frameworkVersionFilename}` );
  process.exit( 1 );
}
if ( !existsSync( dockerComposeFilename ) ) {
  console.error( `Missing file ${dockerComposeFilename}` );
  process.exit( 1 );
}

console.log( `- Rewriting ${dockerComposeFilename}` );

const dockerComposeContent = readFileSync( dockerComposeFilename, 'utf-8' );
const apiVarName = 'OUTPUT_API_VERSION';
const apiVarMatcher = new RegExp( `\\$\\{${apiVarName}:-[^}]+\\}`, 'g' );
if ( !apiVarMatcher.test( dockerComposeContent ) ) {
  console.error( `File ${dockerComposeFilename} does not have the ${apiVarName} env var reference` );
  process.exit( 1 );
}

// overwrites the docker-compose-dev.yml with the new env var version
writeFileSync( dockerComposeFilename, dockerComposeContent.replace( apiVarMatcher, `\${${apiVarName}:-${version}}` ) );

console.log( `- Rewriting ${frameworkVersionFilename}` );

// overwrites the framework_version file with the new version
writeFileSync( frameworkVersionFilename, JSON.stringify( { framework: version }, null, 2 ) + '\n' );

console.log( '\x1b[0;32m%s\x1b[0m', '- Rewrite completed' );
