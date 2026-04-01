import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { applyReconfiguration, planReconfiguration, legacyScripts } from './reconfigure_package.js';

describe( 'reconfigure package', () => {
  it( 'should remove legacy keys and apply template scripts while preserving other scripts', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'reconfigure-test-' ) );
    const pkg = {
      name: 'my-proj',
      version: '1.0.0',
      scripts: {
        'worker:install': 'npm install',
        'worker:build': 'tsc',
        'worker:start': 'node dist/worker.js',
        dev: 'old dev',
        'custom:test': 'vitest'
      }
    };
    await fs.writeFile( path.join( tmpDir, 'package.json' ), JSON.stringify( pkg, null, 2 ), 'utf-8' );

    const plan = planReconfiguration( tmpDir );

    expect( plan.scriptsToRemove.map( r => r.key ).sort() ).toEqual( [ ...legacyScripts ].sort() );
    expect( plan.hasChanges ).toBe( true );
    expect( plan.scriptsToReplace ).toEqual( [] );
    expect( plan.scriptsToAdd ).toHaveLength( 6 );

    applyReconfiguration( plan );

    const next = JSON.parse( await fs.readFile( path.join( tmpDir, 'package.json' ), 'utf-8' ) ) as {
      scripts: Record<string, string>;
    };

    expect( next.scripts['worker:install'] ).toBeUndefined();
    expect( next.scripts['custom:test'] ).toBe( 'vitest' );
    expect( next.scripts['output:dev'] ).toBe( 'output dev' );
    expect( next.scripts['output:worker:start'] ).toBe( 'output-worker' );
  } );

  it( 'should classify an existing key with a different value as replace, and new keys as add', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'reconfigure-test-' ) );
    const pkg = {
      name: 'my-proj',
      version: '1.0.0',
      scripts: {
        'output:dev': 'bad-dev-command'
      }
    };
    await fs.writeFile( path.join( tmpDir, 'package.json' ), JSON.stringify( pkg, null, 2 ), 'utf-8' );

    const plan = planReconfiguration( tmpDir );

    expect( plan.scriptsToRemove ).toEqual( [] );
    expect( plan.scriptsToReplace ).toEqual( [
      { key: 'output:dev', before: 'bad-dev-command', after: 'output dev' }
    ] );
    expect( plan.scriptsToAdd ).toHaveLength( 5 );
    expect( plan.scriptsToAdd.map( a => a.key ).sort() ).toEqual( [
      'output:worker',
      'output:worker:build',
      'output:worker:install',
      'output:worker:start',
      'output:worker:watch'
    ].sort() );
  } );

  it( 'should throw when package.json is missing', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'reconfigure-test-' ) );
    expect( () => planReconfiguration( tmpDir ) ).toThrow( /No package\.json found/ );
  } );

  it( 'should throw when package.json is not valid JSON', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'reconfigure-test-' ) );
    await fs.writeFile( path.join( tmpDir, 'package.json' ), '{ not json', 'utf-8' );
    expect( () => planReconfiguration( tmpDir ) ).toThrow( /not valid JSON/ );
  } );
} );
