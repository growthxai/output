import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FatalError } from '@outputai/core';
import { searchAndReadFile } from './file.js';

const dirs = [];

const tempDir = () => {
  const dir = mkdtempSync( join( tmpdir(), 'search-and-read-' ) );
  dirs.push( dir );
  return dir;
};

afterEach( () => {
  for ( const dir of dirs.splice( 0 ) ) {
    rmSync( dir, { recursive: true, force: true } );
  }
} );

describe( 'searchAndReadFile', () => {
  it( 'reads a file in the search directory', () => {
    const dir = tempDir();
    writeFileSync( join( dir, 'notes.txt' ), 'hello' );

    expect( searchAndReadFile( dir, 'notes.txt' ) ).toEqual( {
      dir,
      content: 'hello'
    } );
  } );

  it( 'reads a file from a nested subdirectory and returns that directory', () => {
    const dir = tempDir();
    const nested = join( dir, 'prompts' );
    mkdirSync( nested );
    writeFileSync( join( nested, 'writer@v1.prompt' ), 'Write it.' );

    expect( searchAndReadFile( dir, 'writer@v1.prompt' ) ).toEqual( {
      dir: nested,
      content: 'Write it.'
    } );
  } );

  it( 'continues into later siblings after a subdirectory miss', () => {
    const dir = tempDir();
    mkdirSync( join( dir, 'empty' ) );
    const found = join( dir, 'found' );
    mkdirSync( found );
    writeFileSync( join( found, 'target.txt' ), 'here' );

    expect( searchAndReadFile( dir, 'target.txt' ) ).toEqual( {
      dir: found,
      content: 'here'
    } );
  } );

  it( 'skips symbolic-link directories', () => {
    const dir = tempDir();
    const hidden = join( dir, 'hidden' );
    const search = join( dir, 'search' );
    mkdirSync( hidden );
    mkdirSync( search );
    writeFileSync( join( hidden, 'secret.txt' ), 'nope' );
    symlinkSync( hidden, join( search, 'link' ) );

    expect( searchAndReadFile( search, 'secret.txt' ) ).toBeNull();
  } );

  it( 'returns null when the file is not found', () => {
    const dir = tempDir();
    writeFileSync( join( dir, 'other.txt' ), 'x' );

    expect( searchAndReadFile( dir, 'missing.txt' ) ).toBeNull();
  } );

  it( 'returns null for an empty directory', () => {
    expect( searchAndReadFile( tempDir(), 'missing.txt' ) ).toBeNull();
  } );

  it( 'throws FatalError when the search directory cannot be scanned', () => {
    const missing = join( tempDir(), 'gone' );

    expect( () => searchAndReadFile( missing, 'notes.txt' ) ).toThrow( FatalError );
    expect( () => searchAndReadFile( missing, 'notes.txt' ) ).toThrow(
      `Error scanning directory "${missing}"`
    );
  } );
} );
