import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Hooks Loader' );

/**
 * Loads the hook files from package.json's "outputai" section.
 *
 * @param {string} rootDir
 * @returns {void}
 */
export async function loadHooks( rootDir ) {
  const packageFile = join( rootDir, 'package.json' );
  if ( existsSync( packageFile ) ) {
    const pkg = await import( packageFile, { with: { type: 'json' } } );
    const content = pkg.default;
    const hooks = [];
    // @DEPRECATED: "output" is the legacy namespace for configs, can be removed after couple version (this is being added in 0.3.x)
    hooks.push( ...( content['output']?.hookFiles ?? [] ) );
    hooks.push( ...( content['outputai']?.hookFiles ?? [] ) );
    for ( const path of hooks ) {
      const hookFile = join( rootDir, path );
      await import( hookFile );
      log.info( 'Hook file loaded', { path } );
    }
  }
};
