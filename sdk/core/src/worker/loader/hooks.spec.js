import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const fsMocks = vi.hoisted( () => ( {
  existsSync: vi.fn().mockReturnValue( false )
} ) );
vi.mock( 'node:fs', () => ( {
  existsSync: fsMocks.existsSync
} ) );

describe( 'loadHooks', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    fsMocks.existsSync.mockReturnValue( false );
  } );

  it( 'resolves without importing when package.json does not exist', async () => {
    fsMocks.existsSync.mockReturnValue( false );
    const { loadHooks } = await import( './hooks.js' );
    await expect( loadHooks( '/root' ) ).resolves.toBeUndefined();
    expect( fsMocks.existsSync ).toHaveBeenCalledWith( join( '/root', 'package.json' ) );
  } );

  it( 'imports hook files listed in package.json outputai.hookFiles', async () => {
    vi.doUnmock( 'node:fs' );
    vi.resetModules();
    const fs = await import( 'node:fs' );
    const tmpDir = fs.mkdtempSync( join( tmpdir(), 'loader-spec-' ) );
    try {
      fs.writeFileSync( join( tmpDir, 'package.json' ), JSON.stringify( {
        outputai: { hookFiles: [ 'hook.js' ] }
      } ) );
      fs.writeFileSync( join( tmpDir, 'hook.js' ), 'globalThis.__loadHooksTestLoaded = true;' );

      const { loadHooks } = await import( './hooks.js' );
      await loadHooks( tmpDir );
      expect( globalThis.__loadHooksTestLoaded ).toBe( true );
    } finally {
      delete globalThis.__loadHooksTestLoaded;
      fs.rmSync( tmpDir, { recursive: true, force: true } );
    }
  } );

  it( 'imports hook files from legacy package.json output.hookFiles', async () => {
    vi.doUnmock( 'node:fs' );
    vi.resetModules();
    const fs = await import( 'node:fs' );
    const tmpDir = fs.mkdtempSync( join( tmpdir(), 'loader-spec-' ) );
    try {
      fs.writeFileSync( join( tmpDir, 'package.json' ), JSON.stringify( {
        output: { hookFiles: [ 'legacy_hook.js' ] }
      } ) );
      fs.writeFileSync( join( tmpDir, 'legacy_hook.js' ), 'globalThis.__loadHooksLegacyTestLoaded = true;' );

      const { loadHooks } = await import( './hooks.js' );
      await loadHooks( tmpDir );
      expect( globalThis.__loadHooksLegacyTestLoaded ).toBe( true );
    } finally {
      delete globalThis.__loadHooksLegacyTestLoaded;
      fs.rmSync( tmpDir, { recursive: true, force: true } );
    }
  } );
} );
