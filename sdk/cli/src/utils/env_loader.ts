/**
 * Environment loader utility
 * Loads .env file from the current working directory
 * Set OUTPUT_CLI_ENV to specify a custom env file path
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import debugFactory from 'debug';
import { config } from '#config.js';

const debug = debugFactory( 'output-cli:env-loader' );

export function loadEnvironment(): void {
  const cwd = process.cwd();
  const envFile = config.envFile;
  const envPath = resolve( cwd, envFile );

  if ( !existsSync( envPath ) ) {
    debug( `Warning: Env file not found: ${envPath}` );
    return;
  }

  debug( `Loading env from: ${envPath}` );
  dotenv.config( { path: envPath, quiet: true } );
}
