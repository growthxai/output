#!/usr/bin/env node
import { glob } from 'node:fs/promises';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SRC = 'src';
const DEST = 'dist';
const PATTERNS = [ '**/*.prompt', '**/*.yml.enc', '**/*.key', '**/*.md' ];

const allFiles = [];
for ( const pattern of PATTERNS ) {
  for await ( const file of glob( pattern, { cwd: SRC } ) ) {
    allFiles.push( file );
  }
}

await Promise.all( allFiles.map( async file => {
  const src = join( SRC, file );
  const dest = join( DEST, file );
  await mkdir( dirname( dest ), { recursive: true } );
  await copyFile( src, dest );
} ) );
