import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Hoisted state so mocks can read dynamic values set in tests
const state = vi.hoisted( () => ( { dir: '', entries: {} } ) );

// Mock core utils to control resolveInvocationDir
vi.mock( '@outputai/core/sdk_utils', () => ( {
  resolveInvocationDir: () => state.dir
} ) );

// Mock node:fs.readFileSync for directory scans while delegating file reads
vi.mock( 'node:fs', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileSync: vi.fn( ( path, options ) => {
      if ( options && typeof options === 'object' && options.withFileTypes ) {
        return state.entries[path] || [];
      }
      return actual.readFileSync( path, options );
    } )
  };
} );

const dirEntry = ( name, { isDir = false, isLink = false } = {} ) => ( {
  name,
  isDirectory: () => isDir,
  isSymbolicLink: () => isLink
} );

beforeEach( () => {
  state.dir = '';
  state.entries = {};
} );

describe( 'loadContent', () => {
  it( 'loads file from root directory using mocked resolveInvocationDir', async () => {
    const tempDir = mkdtempSync( join( tmpdir(), 'load-content-test-' ) );
    state.dir = tempDir;
    const testContent = 'test file content';
    writeFileSync( join( tempDir, 'test.txt' ), testContent );
    state.entries[tempDir] = [ dirEntry( 'test.txt' ) ];

    const { loadContent } = await import( './load_content.js' );
    const content = loadContent( 'test.txt' );

    expect( content ).toBe( testContent );
  } );

  it( 'loads file from nested subdirectory via recursion', async () => {
    const tempDir = mkdtempSync( join( tmpdir(), 'load-content-test-' ) );
    const subDir = join( tempDir, 'subdir' );
    mkdirSync( subDir );
    state.dir = tempDir;

    const testContent = 'nested file content';
    writeFileSync( join( subDir, 'nested.txt' ), testContent );

    state.entries[tempDir] = [ dirEntry( 'subdir', { isDir: true } ) ];
    state.entries[subDir] = [ dirEntry( 'nested.txt' ) ];

    const { loadContent } = await import( './load_content.js' );
    const content = loadContent( 'nested.txt' );

    expect( content ).toBe( testContent );
  } );

  it( 'returns null when file does not exist', async () => {
    const tempDir = mkdtempSync( join( tmpdir(), 'load-content-test-' ) );
    state.dir = tempDir;
    state.entries[tempDir] = [ dirEntry( 'other.txt' ) ];

    const { loadContent } = await import( './load_content.js' );
    const content = loadContent( 'nonexistent.txt' );

    expect( content ).toBeNull();
  } );
} );
