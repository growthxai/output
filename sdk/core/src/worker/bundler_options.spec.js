import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webpackConfigHook } from './bundler_options.js';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const TEMP_BASE = join( process.cwd(), 'sdk/core/temp_test_bundler_options' );

afterEach( () => {
  rmSync( TEMP_BASE, { recursive: true, force: true } );
} );

const buildExcludes = () => {
  const config = webpackConfigHook( {} );
  return config.module.rules.map( rule => rule.exclude );
};

const writePackageResource = ( packagePath, pkgJson ) => {
  const resource = join( packagePath, 'lib', 'index.js' );
  mkdirSync( dirname( resource ), { recursive: true } );
  writeFileSync( join( packagePath, 'package.json' ), JSON.stringify( pkgJson ) );
  writeFileSync( resource, 'export const x = 1;\n' );
  return resource;
};

describe( 'webpackConfigHook loader excludes', () => {
  it( 'keeps loaders enabled for project files outside node_modules', () => {
    for ( const exclude of buildExcludes() ) {
      expect( exclude( join( TEMP_BASE, 'src', 'workflow.js' ) ) ).toBe( false );
    }
  } );

  it( 'excludes worker and interface internals', () => {
    for ( const exclude of buildExcludes() ) {
      expect( exclude( join( __dirname, 'loader.js' ) ) ).toBe( true );
      expect( exclude( join( __dirname, '..', 'interface', 'index.js' ) ) ).toBe( true );
    }
  } );

  it( 'keeps loaders enabled for packages that expose workflows', () => {
    const resource = writePackageResource(
      join( TEMP_BASE, 'node_modules', '@acme', 'catalog' ),
      { name: '@acme/catalog', outputai: { workflows: { expose: true } } }
    );

    for ( const exclude of buildExcludes() ) {
      expect( exclude( resource ) ).toBe( false );
    }
  } );

  it( 'excludes packages that do not expose workflows', () => {
    const resource = writePackageResource(
      join( TEMP_BASE, 'node_modules', 'plain_lib' ),
      { name: 'plain_lib', dependencies: { '@outputai/core': '1.0.0' } }
    );

    for ( const exclude of buildExcludes() ) {
      expect( exclude( resource ) ).toBe( true );
    }
  } );
} );
