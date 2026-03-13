/**
 * Tests set_sdk_version.js as a subprocess against a temp tree that mirrors
 * ../src/assets/docker and ../src/generated relative to the script (no refactor).
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
  mkdtempSync
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const scriptSource = join( __dirname, 'set_sdk_version.js' );

/** Holds latest temp dir for afterEach cleanup (no let / always initialized). */
const fixtureState = { tempRoot: null };

function layoutPaths( root ) {
  const scriptsDir = join( root, 'scripts' );
  const src = join( root, 'src' );
  return {
    root,
    scriptPath: join( scriptsDir, 'set_sdk_version.js' ),
    dockerPath: join( src, 'assets', 'docker', 'docker-compose-dev.yml' ),
    frameworkPath: join( src, 'generated', 'framework_version.json' )
  };
}

function createFixture( root, { dockerContent, frameworkContent } ) {
  const paths = layoutPaths( root );
  mkdirSync( join( root, 'scripts' ), { recursive: true } );
  mkdirSync( join( root, 'src', 'assets', 'docker' ), { recursive: true } );
  mkdirSync( join( root, 'src', 'generated' ), { recursive: true } );
  writeFileSync( join( root, 'package.json' ), JSON.stringify( { type: 'module' } ) );
  copyFileSync( scriptSource, paths.scriptPath );
  writeFileSync( paths.dockerPath, dockerContent ?? '', 'utf-8' );
  writeFileSync(
    paths.frameworkPath,
    frameworkContent ?? JSON.stringify( { framework: '0.0.0' }, null, 2 ) + '\n',
    'utf-8'
  );
  return paths;
}

function runScript( root, args = [] ) {
  const paths = layoutPaths( root );
  return spawnSync( process.execPath, [ paths.scriptPath, ...args ], {
    encoding: 'utf-8',
    cwd: root,
    env: { ...process.env }
  } );
}

afterEach( () => {
  if ( fixtureState.tempRoot ) {
    try {
      rmSync( fixtureState.tempRoot, { recursive: true, force: true } );
    } catch {
      // ignore
    }
    fixtureState.tempRoot = null;
  }
} );

describe( 'set_sdk_version.js', () => {
  it( 'exits 1 with stderr when version argument is missing', () => {
    fixtureState.tempRoot = mkdtempSync( join( __dirname, 'set_sdk_version-fixture-' ) );
    createFixture( fixtureState.tempRoot, {
      dockerContent: 'image: x:${OUTPUT_API_VERSION:-1.0.0}\n'
    } );
    const result = runScript( fixtureState.tempRoot, [] );
    expect( result.status ).toBe( 1 );
    expect( result.stderr ).toContain( 'Missing version argument' );
  } );

  it( 'exits 1 when version is whitespace only', () => {
    fixtureState.tempRoot = mkdtempSync( join( __dirname, 'set_sdk_version-fixture-' ) );
    createFixture( fixtureState.tempRoot, {
      dockerContent: 'image: x:${OUTPUT_API_VERSION:-1.0.0}\n'
    } );
    const result = runScript( fixtureState.tempRoot, [ '   ' ] );
    expect( result.status ).toBe( 1 );
    expect( result.stderr ).toContain( 'Missing version argument' );
  } );

  it( 'exits 1 when framework_version.json is missing', () => {
    fixtureState.tempRoot = mkdtempSync( join( __dirname, 'set_sdk_version-fixture-' ) );
    const paths = layoutPaths( fixtureState.tempRoot );
    mkdirSync( join( fixtureState.tempRoot, 'scripts' ), { recursive: true } );
    mkdirSync( join( fixtureState.tempRoot, 'src', 'assets', 'docker' ), { recursive: true } );
    writeFileSync( join( fixtureState.tempRoot, 'package.json' ), JSON.stringify( { type: 'module' } ) );
    copyFileSync( scriptSource, paths.scriptPath );
    writeFileSync( paths.dockerPath, 'image: x:${OUTPUT_API_VERSION:-1.0.0}\n', 'utf-8' );
    // no framework_version.json

    const result = runScript( fixtureState.tempRoot, [ '1.0.0' ] );
    expect( result.status ).toBe( 1 );
    expect( result.stderr ).toContain( 'Missing file' );
    expect( result.stderr ).toContain( 'framework_version.json' );
  } );

  it( 'exits 1 when docker-compose-dev.yml is missing', () => {
    fixtureState.tempRoot = mkdtempSync( join( __dirname, 'set_sdk_version-fixture-' ) );
    const paths = layoutPaths( fixtureState.tempRoot );
    mkdirSync( join( fixtureState.tempRoot, 'scripts' ), { recursive: true } );
    mkdirSync( join( fixtureState.tempRoot, 'src', 'generated' ), { recursive: true } );
    writeFileSync( join( fixtureState.tempRoot, 'package.json' ), JSON.stringify( { type: 'module' } ) );
    copyFileSync( scriptSource, paths.scriptPath );
    writeFileSync( paths.frameworkPath, '{}\n', 'utf-8' );
    // no docker-compose-dev.yml

    const result = runScript( fixtureState.tempRoot, [ '1.0.0' ] );
    expect( result.status ).toBe( 1 );
    expect( result.stderr ).toContain( 'Missing file' );
    expect( result.stderr ).toContain( 'docker-compose-dev.yml' );
  } );

  it( 'exits 1 when docker file has no OUTPUT_API_VERSION reference', () => {
    fixtureState.tempRoot = mkdtempSync( join( __dirname, 'set_sdk_version-fixture-' ) );
    createFixture( fixtureState.tempRoot, { dockerContent: 'image: nginx:latest\n' } );
    const result = runScript( fixtureState.tempRoot, [ '1.0.0' ] );
    expect( result.status ).toBe( 1 );
    expect( result.stderr ).toContain( 'does not have the OUTPUT_API_VERSION env var reference' );
  } );

  it( 'replaces one occurrence and writes framework_version.json', () => {
    fixtureState.tempRoot = mkdtempSync( join( __dirname, 'set_sdk_version-fixture-' ) );
    const dockerContent = 'image: outputai/api:${OUTPUT_API_VERSION:-2.0.0}\n';
    createFixture( fixtureState.tempRoot, { dockerContent } );
    const paths = layoutPaths( fixtureState.tempRoot );

    const result = runScript( fixtureState.tempRoot, [ '3.4.5' ] );
    expect( result.status ).toBe( 0 );
    expect( result.stdout ).toContain( '[CLI]: Set SDK version' );
    expect( result.stdout ).toContain( '- New version: 3.4.5' );
    expect( result.stdout ).toContain( '- Rewriting' );
    expect( result.stdout ).toContain( '- Rewrite completed' );

    expect( readFileSync( paths.dockerPath, 'utf-8' ) ).toBe(
      'image: outputai/api:${OUTPUT_API_VERSION:-3.4.5}\n'
    );
    expect( readFileSync( paths.frameworkPath, 'utf-8' ) ).toBe(
      JSON.stringify( { framework: '3.4.5' }, null, 2 ) + '\n'
    );
  } );

  it( 'replaces two occurrences in docker-compose content', () => {
    fixtureState.tempRoot = mkdtempSync( join( __dirname, 'set_sdk_version-fixture-' ) );
    const dockerContent = [
      '  api:',
      '    image: outputai/api:${OUTPUT_API_VERSION:-2.0.0}',
      '  api2:',
      '    image: outputai/api:${OUTPUT_API_VERSION:-2.0.0}',
      ''
    ].join( '\n' );
    createFixture( fixtureState.tempRoot, { dockerContent } );
    const paths = layoutPaths( fixtureState.tempRoot );

    const result = runScript( fixtureState.tempRoot, [ '9.9.9' ] );
    expect( result.status ).toBe( 0 );
    expect( result.stdout ).toContain( '- New version: 9.9.9' );
    expect( result.stdout ).toContain( '- Rewrite completed' );

    const out = readFileSync( paths.dockerPath, 'utf-8' );
    const matches = out.match( /\$\{OUTPUT_API_VERSION:-9\.9\.9\}/g );
    expect( matches ).toHaveLength( 2 );
    expect( out ).not.toContain( '2.0.0' );
  } );

  it( 'trims version from argv before writing', () => {
    fixtureState.tempRoot = mkdtempSync( join( __dirname, 'set_sdk_version-fixture-' ) );
    createFixture( fixtureState.tempRoot, {
      dockerContent: 'x: ${OUTPUT_API_VERSION:-old}\n'
    } );
    const paths = layoutPaths( fixtureState.tempRoot );

    const result = runScript( fixtureState.tempRoot, [ '  1.0.0  ' ] );
    expect( result.status ).toBe( 0 );
    expect( result.stdout ).toContain( '- New version: 1.0.0' );
    expect( result.stdout ).toContain( '- Rewrite completed' );
    expect( readFileSync( paths.dockerPath, 'utf-8' ) ).toContain(
      '${OUTPUT_API_VERSION:-1.0.0}'
    );
    expect( readFileSync( paths.frameworkPath, 'utf-8' ) ).toContain( '"framework": "1.0.0"' );
  } );
} );
