#!/usr/bin/env node
import { copyFileSync, mkdirSync, globSync } from 'node:fs';
import { dirname, join } from 'node:path';

const srcDir = 'src';
const destDir = 'dist';
const matchers = [ '**/*.prompt', '**/*.yml.enc', '**/*.key', '**/*.md' ];

for ( const pattern of matchers ) {
  for ( const file of globSync( pattern, { cwd: srcDir } ) ) {
    const src = join( srcDir, file );
    const dest = join( destDir, file );
    mkdirSync( dirname( dest ), { recursive: true } );
    copyFileSync( src, dest );
  }
}
