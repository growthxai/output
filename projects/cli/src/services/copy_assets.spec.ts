import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

// Resolve to the cli package root, then into dist/templates
const cliRoot = path.resolve( __dirname, '..', '..' );
const distTemplatesDir = path.join( cliRoot, 'dist', 'templates', 'project' );

describe( 'copy-assets build output', () => {
  it( 'should include dotfile templates in dist/templates/project/', () => {
    const dotfiles = [ '.env.example.template', '.gitignore.template' ];

    for ( const dotfile of dotfiles ) {
      const filePath = path.join( distTemplatesDir, dotfile );
      expect( fs.existsSync( filePath ), `Missing dotfile template in dist: ${dotfile}` ).toBe( true );
    }
  } );

  it( 'should include config templates in dist/templates/project/', () => {
    const configFile = path.join( distTemplatesDir, 'config', 'costs.yml.template' );
    expect( fs.existsSync( configFile ), 'Missing config/costs.yml.template in dist' ).toBe( true );
  } );
} );
