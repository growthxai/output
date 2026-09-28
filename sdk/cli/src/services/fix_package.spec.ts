import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { applyFix, planFix, legacyScripts } from './fix_package.js';

describe( 'fix package', () => {
  it( 'should remove legacy keys and apply template scripts while preserving other scripts', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'fix-test-' ) );
    const pkg = {
      name: 'my-proj',
      version: '1.0.0',
      scripts: {
        dev: 'old dev',
        'custom:test': 'vitest'
      }
    };
    await fs.writeFile( path.join( tmpDir, 'package.json' ), JSON.stringify( pkg, null, 2 ), 'utf-8' );

    const plan = planFix( tmpDir );

    expect( plan.scriptsToRemove.map( r => r.key ).sort() ).toEqual( [ ...legacyScripts ].sort() );
    expect( plan.hasChanges ).toBe( true );
    expect( plan.scriptsToReplace ).toEqual( [] );
    expect( plan.scriptsToAdd ).toHaveLength( 7 );

    applyFix( plan );

    const next = JSON.parse( await fs.readFile( path.join( tmpDir, 'package.json' ), 'utf-8' ) ) as {
      scripts: Record<string, string>;
    };

    expect( next.scripts['dev'] ).toBeUndefined();
    expect( next.scripts['custom:test'] ).toBe( 'vitest' );
    expect( next.scripts['output:dev'] ).toBe( 'output dev' );
    expect( next.scripts['output:worker:start'] ).toBe( 'output-worker' );
  } );

  it( 'should classify an existing key with a different value as replace, and new keys as add', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'fix-test-' ) );
    const pkg = {
      name: 'my-proj',
      version: '1.0.0',
      scripts: {
        'output:dev': 'bad-dev-command'
      }
    };
    await fs.writeFile( path.join( tmpDir, 'package.json' ), JSON.stringify( pkg, null, 2 ), 'utf-8' );

    const plan = planFix( tmpDir );

    expect( plan.scriptsToRemove ).toEqual( [] );
    expect( plan.scriptsToReplace ).toEqual( [
      { key: 'output:dev', before: 'bad-dev-command', after: 'output dev' }
    ] );
    expect( plan.scriptsToAdd ).toHaveLength( 6 );
    expect( plan.scriptsToAdd.map( a => a.key ).sort() ).toEqual( [
      'output:worker',
      'output:worker:build',
      'output:worker:check',
      'output:worker:install',
      'output:worker:start',
      'output:worker:watch'
    ].sort() );
  } );

  it( 'should remove hook files pointing to @outputai/credentials and keep the others', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'fix-test-' ) );
    const pkg = {
      name: 'my-proj',
      outputai: {
        hookFiles: [
          'dist/hooks/cost_hooks.js',
          'node_modules/@outputai/credentials/dist/hooks.js',
          'dist/hooks/register_credentials.js'
        ]
      }
    };
    await fs.writeFile( path.join( tmpDir, 'package.json' ), JSON.stringify( pkg, null, 2 ), 'utf-8' );

    const plan = planFix( tmpDir );

    expect( plan.hookFilesToRemove ).toEqual( [ 'node_modules/@outputai/credentials/dist/hooks.js' ] );

    applyFix( plan );

    const next = JSON.parse( await fs.readFile( path.join( tmpDir, 'package.json' ), 'utf-8' ) ) as {
      outputai: { hookFiles: string[] };
    };

    expect( next.outputai.hookFiles ).toEqual( [ 'dist/hooks/cost_hooks.js', 'dist/hooks/register_credentials.js' ] );
  } );

  it( 'should leave outputai untouched when hookFiles is missing or not an array', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'fix-test-' ) );
    const missing = { name: 'my-proj', outputai: {} };
    await fs.writeFile( path.join( tmpDir, 'package.json' ), JSON.stringify( missing, null, 2 ), 'utf-8' );

    const missingPlan = planFix( tmpDir );

    expect( missingPlan.hookFilesToRemove ).toEqual( [] );
    expect( JSON.parse( missingPlan.packageJsonUpdatedContent ).outputai ).toEqual( {} );

    const malformed = { name: 'my-proj', outputai: { hookFiles: 'node_modules/@outputai/credentials/dist/hooks.js' } };
    await fs.writeFile( path.join( tmpDir, 'package.json' ), JSON.stringify( malformed, null, 2 ), 'utf-8' );

    const malformedPlan = planFix( tmpDir );

    expect( malformedPlan.hookFilesToRemove ).toEqual( [] );
    expect( JSON.parse( malformedPlan.packageJsonUpdatedContent ).outputai ).toEqual( malformed.outputai );
  } );

  it( 'should throw when package.json is missing', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'fix-test-' ) );
    expect( () => planFix( tmpDir ) ).toThrow( /No package\.json found/ );
  } );

  it( 'should throw when package.json is not valid JSON', async () => {
    const tmpDir = await fs.mkdtemp( path.join( os.tmpdir(), 'fix-test-' ) );
    await fs.writeFile( path.join( tmpDir, 'package.json' ), '{ not json', 'utf-8' );
    expect( () => planFix( tmpDir ) ).toThrow( /not a valid JSON/ );
  } );
} );
