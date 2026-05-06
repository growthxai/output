import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  activityMatchersBuilder,
  matchFiles,
  findWorkflowsInNodeModules,
  findWorkflowsInPackages,
  findSharedActivitiesFromWorkflows,
  importComponents,
  findPackageRoot,
  isPackageRoot,
  isPathDescendentFromNodeModules,
  resolveNodeModulesPath,
  resolveSymlink,
  staticMatchers,
  packageExposesWorkflows
} from './loader_tools.js';

const TEMP_BASE = join( process.cwd(), 'sdk/core/temp_test_modules' );

afterEach( () => {
  rmSync( TEMP_BASE, { recursive: true, force: true } );
} );

const fileEntry = path => ( { path, url: pathToFileURL( path ).href } );

describe( 'resolveSymlink', () => {
  it( 'returns the canonical path for a directory', () => {
    const dir = join( TEMP_BASE, `rs-dir-${Date.now()}` );
    mkdirSync( dir, { recursive: true } );
    expect( resolveSymlink( dir ) ).toBe( dir );
  } );

  it( 'returns the canonical path for a regular file', () => {
    const dir = join( TEMP_BASE, `rs-file-${Date.now()}` );
    mkdirSync( dir, { recursive: true } );
    const file = join( dir, 'a.txt' );
    writeFileSync( file, 'x' );
    expect( resolveSymlink( file ) ).toBe( file );
  } );

  it( 'returns null for a broken symlink', () => {
    const dir = join( TEMP_BASE, `rs-broken-${Date.now()}` );
    mkdirSync( dir, { recursive: true } );
    const link = join( dir, 'broken' );
    symlinkSync( 'missing-target', link, 'file' );
    expect( resolveSymlink( link ) ).toBe( null );
  } );
} );

describe( 'resolveNodeModulesPath', () => {
  it( 'returns node_modules when passed that directory', () => {
    const root = join( TEMP_BASE, `rnm-direct-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    mkdirSync( nm, { recursive: true } );
    expect( resolveNodeModulesPath( nm ) ).toBe( nm );
  } );

  it( 'finds node_modules from a project root directory', () => {
    const root = join( TEMP_BASE, `rnm-root-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    mkdirSync( nm, { recursive: true } );
    expect( resolveNodeModulesPath( root ) ).toBe( nm );
  } );

  it( 'walks upward from a nested path until node_modules is found', () => {
    const root = join( TEMP_BASE, `rnm-walk-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const nested = join( root, 'src', 'deep' );
    mkdirSync( nested, { recursive: true } );
    mkdirSync( nm, { recursive: true } );
    expect( resolveNodeModulesPath( nested ) ).toBe( nm );
  } );

  it( 'uses dirname when targetPath is a file', () => {
    const root = join( TEMP_BASE, `rnm-file-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const file = join( root, 'index.js' );
    mkdirSync( nm, { recursive: true } );
    writeFileSync( file, '' );
    expect( resolveNodeModulesPath( file ) ).toBe( nm );
  } );

  it( 'returns null when targetPath does not exist', () => {
    expect( resolveNodeModulesPath( join( TEMP_BASE, 'nope', 'missing' ) ) ).toBe( null );
  } );

  it( 'returns null when no ancestor has node_modules', () => {
    const isolated = mkdtempSync( join( tmpdir(), 'loader-tools-rnm-' ) );
    try {
      const orphan = join( isolated, 'nested', 'sub' );
      mkdirSync( orphan, { recursive: true } );
      expect( resolveNodeModulesPath( orphan ) ).toBe( null );
    } finally {
      rmSync( isolated, { recursive: true, force: true } );
    }
  } );

  it( 'returns the canonical directory when node_modules is a symlink', () => {
    const root = join( TEMP_BASE, `rnm-symlink-${Date.now()}` );
    const realNm = join( root, 'real_node_modules' );
    const nmLink = join( root, 'node_modules' );
    mkdirSync( realNm, { recursive: true } );
    symlinkSync( 'real_node_modules', nmLink, 'dir' );
    expect( resolveNodeModulesPath( root ) ).toBe( realNm );
  } );

  it( 'walks up when node_modules is a broken symlink', () => {
    const grandparent = join( TEMP_BASE, `rnm-walkup-${Date.now()}` );
    const root = join( grandparent, 'proj' );
    const nmBroken = join( root, 'node_modules' );
    const nmUp = join( grandparent, 'node_modules' );
    mkdirSync( nmUp, { recursive: true } );
    mkdirSync( root, { recursive: true } );
    symlinkSync( 'does-not-exist', nmBroken, 'dir' );
    expect( resolveNodeModulesPath( root ) ).toBe( nmUp );
  } );
} );

describe( 'node_modules package resource helpers', () => {
  it( 'detects paths inside node_modules', () => {
    expect( isPathDescendentFromNodeModules( `${sep}app${sep}node_modules${sep}pkg${sep}index.js` ) ).toBe( true );
    expect( isPathDescendentFromNodeModules( 'C:\\app\\node_modules\\pkg\\index.js' ) ).toBe( true );
    expect( isPathDescendentFromNodeModules( `${sep}app${sep}src${sep}index.js` ) ).toBe( false );
  } );

  it( 'detects installed package roots', () => {
    expect( isPackageRoot( `${sep}app${sep}node_modules${sep}pkg` ) ).toBe( true );
    expect( isPackageRoot( `${sep}app${sep}node_modules${sep}@scope${sep}pkg` ) ).toBe( true );
    expect( isPackageRoot( `${sep}app${sep}node_modules${sep}@scope` ) ).toBe( false );
    expect( isPackageRoot( `${sep}app${sep}node_modules${sep}pkg${sep}lib` ) ).toBe( false );
  } );

  it( 'finds the closest installed package root for a file', () => {
    const root = join( TEMP_BASE, `pkgroot-${Date.now()}` );
    const pkgRoot = join( root, 'node_modules', '@acme', 'wf_pkg' );
    const deepFile = join( pkgRoot, 'lib', 'nested', 'workflow.js' );
    mkdirSync( join( pkgRoot, 'lib', 'nested' ), { recursive: true } );
    writeFileSync( join( pkgRoot, 'package.json' ), JSON.stringify( {
      name: '@acme/wf_pkg',
      dependencies: { '@outputai/core': '1.0.0' }
    } ) );
    writeFileSync( deepFile, 'export default {};\n' );

    expect( findPackageRoot( deepFile ) ).toBe( pkgRoot );
  } );

  it( 'returns null when no installed package root is found', () => {
    const root = join( TEMP_BASE, `pkgroot-missing-${Date.now()}` );
    const deepFile = join( root, 'node_modules', 'plain_lib', 'index.js' );
    mkdirSync( dirname( deepFile ), { recursive: true } );
    writeFileSync( deepFile, 'export const x = 1;\n' );

    expect( findPackageRoot( deepFile ) ).toBe( null );
  } );
} );

describe( 'activityMatchersBuilder', () => {
  const base = `${sep}app${sep}proj`;

  it( 'stepsFile matches only steps.js at base', () => {
    const m = activityMatchersBuilder( base );
    expect( m.stepsFile( `${base}${sep}steps.js` ) ).toBe( true );
    expect( m.stepsFile( `${base}${sep}nested${sep}steps.js` ) ).toBe( false );
  } );

  it( 'evaluatorsFile matches only evaluators.js at base', () => {
    const m = activityMatchersBuilder( base );
    expect( m.evaluatorsFile( `${base}${sep}evaluators.js` ) ).toBe( true );
    expect( m.evaluatorsFile( `${base}${sep}sub${sep}evaluators.js` ) ).toBe( false );
  } );

  it( 'stepsDir matches js under steps/', () => {
    const m = activityMatchersBuilder( base );
    expect( m.stepsDir( `${base}${sep}steps${sep}a.js` ) ).toBe( true );
    expect( m.stepsDir( `${base}${sep}steps${sep}sub${sep}b.js` ) ).toBe( true );
    expect( m.stepsDir( `${base}${sep}other${sep}a.js` ) ).toBe( false );
  } );

  it( 'evaluatorsDir matches js under evaluators/', () => {
    const m = activityMatchersBuilder( base );
    expect( m.evaluatorsDir( `${base}${sep}evaluators${sep}x.js` ) ).toBe( true );
    expect( m.evaluatorsDir( `${base}${sep}evaluators${sep}y${sep}z.js` ) ).toBe( true );
    expect( m.evaluatorsDir( `${base}${sep}steps${sep}x.js` ) ).toBe( false );
  } );
} );

describe( 'matchFiles', () => {
  it( 'collects files matching matchers', () => {
    const root = join( TEMP_BASE, `fbnr-files-${Date.now()}` );
    mkdirSync( root, { recursive: true } );
    writeFileSync( join( root, 'a.txt' ), '' );
    writeFileSync( join( root, 'b.txt' ), '' );
    const found = matchFiles( root, [ p => p.endsWith( 'a.txt' ) ] );
    expect( found ).toHaveLength( 1 );
    expect( found[0].path ).toBe( join( root, 'a.txt' ) );
  } );

  it( 'skips broken symlinks without throwing', () => {
    const root = join( TEMP_BASE, `fbnr-broken-${Date.now()}` );
    mkdirSync( root, { recursive: true } );
    symlinkSync( 'nowhere', join( root, 'bad' ), 'file' );
    writeFileSync( join( root, 'ok.txt' ), '' );
    const found = matchFiles( root, [ p => p.endsWith( '.txt' ) ] );
    expect( found.map( f => f.path ) ).toEqual( [ join( root, 'ok.txt' ) ] );
  } );

  it( 'follows symlinks to directories', () => {
    const base = join( TEMP_BASE, `fbnr-symlink-dir-${Date.now()}` );
    const targetDir = join( base, 'target' );
    const scanRoot = join( base, 'root' );
    mkdirSync( targetDir, { recursive: true } );
    mkdirSync( scanRoot, { recursive: true } );
    writeFileSync( join( targetDir, 'x.txt' ), '' );
    symlinkSync( join( '..', 'target' ), join( scanRoot, 'link' ), 'dir' );
    const found = matchFiles( scanRoot, [ p => p.endsWith( 'x.txt' ) ] );
    expect( found ).toHaveLength( 1 );
    expect( found[0].path ).toBe( join( targetDir, 'x.txt' ) );
  } );
} );

describe( 'findWorkflowsInPackages', () => {
  it( 'collects workflow.js from exposed workflow packages under node_modules', () => {
    const root = join( TEMP_BASE, `fwp-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const pkg = join( nm, 'wf_pkg' );
    mkdirSync( join( pkg, 'lib' ), { recursive: true } );
    writeFileSync( join( pkg, 'package.json' ), JSON.stringify( {
      name: 'wf_pkg',
      '@outputai/config': { workflows: { expose: true } }
    } ) );
    const wf = join( pkg, 'lib', 'workflow.js' );
    writeFileSync( wf, 'export default {};\n' );

    const found = findWorkflowsInPackages( nm );
    expect( found ).toHaveLength( 1 );
    expect( found[0].path ).toBe( wf );
  } );

  it( 'lists the same workflow twice when package scan sees a canonical package and symlink alias', () => {
    const root = join( TEMP_BASE, `fwp-symlink-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const realPkg = join( nm, 'real_pkg' );
    const linkPkg = join( nm, 'link_pkg' );
    mkdirSync( join( realPkg, 'w' ), { recursive: true } );
    const wf = join( realPkg, 'w', 'workflow.js' );
    writeFileSync( join( realPkg, 'package.json' ), JSON.stringify( {
      name: 'real_pkg',
      '@outputai/config': { workflows: { expose: true } }
    } ) );
    writeFileSync( wf, 'export default {};\n' );
    symlinkSync( 'real_pkg', linkPkg, 'dir' );

    const found = findWorkflowsInPackages( nm );
    expect( found ).toHaveLength( 2 );
    expect( new Set( found.map( f => realpathSync( f.path ) ) ).size ).toBe( 1 );
  } );
} );

describe( 'importComponents', () => {
  it( 'imports modules and yields metadata from exports tagged with METADATA_ACCESS_SYMBOL', async () => {
    const root = join( TEMP_BASE, `meta-${Date.now()}` );
    mkdirSync( root, { recursive: true } );
    const file = join( root, 'meta.module.js' );
    writeFileSync( file, [
      'import { METADATA_ACCESS_SYMBOL } from "#consts";',
      'export const StepA = () => {};',
      'StepA[METADATA_ACCESS_SYMBOL] = { kind: "step", name: "a" };',
      'export const FlowB = () => {};',
      'FlowB[METADATA_ACCESS_SYMBOL] = { kind: "workflow", name: "b" };'
    ].join( '\n' ) );

    const collected = [];
    for await ( const m of importComponents( [ fileEntry( file ) ] ) ) {
      collected.push( m );
    }

    expect( collected.length ).toBe( 2 );
    expect( collected.map( m => m.metadata.name ).sort() ).toEqual( [ 'a', 'b' ] );
    expect( collected.map( m => m.metadata.kind ).sort() ).toEqual( [ 'step', 'workflow' ] );
    for ( const m of collected ) {
      expect( m.path ).toBe( file );
      expect( typeof m.fn ).toBe( 'function' );
    }
  } );

  it( 'ignores exports without metadata symbol', async () => {
    const root = join( TEMP_BASE, `meta-${Date.now()}-nometa` );
    mkdirSync( root, { recursive: true } );
    const file = join( root, 'meta.module.js' );
    writeFileSync( file, [
      'export const Plain = () => {};',
      'export const AlsoPlain = {}'
    ].join( '\n' ) );

    const collected = [];
    for await ( const m of importComponents( [ fileEntry( file ) ] ) ) {
      collected.push( m );
    }

    expect( collected.length ).toBe( 0 );
  } );

  it( 'skips files inside ignored directories (node_modules, vendor)', async () => {
    const root = join( TEMP_BASE, `meta-${Date.now()}-ignoredirs` );
    const okDir = join( root, 'ok' );
    const nmDir = join( root, 'node_modules' );
    const vendorDir = join( root, 'vendor' );
    mkdirSync( okDir, { recursive: true } );
    mkdirSync( nmDir, { recursive: true } );
    mkdirSync( vendorDir, { recursive: true } );

    const okFile = join( okDir, 'meta.module.js' );
    const nmFile = join( nmDir, 'meta.module.js' );
    const vendorFile = join( vendorDir, 'meta.module.js' );

    const fileContents = [
      'import { METADATA_ACCESS_SYMBOL } from "#consts";',
      'export const C = () => {};',
      'C[METADATA_ACCESS_SYMBOL] = { kind: "step", name: "c" };'
    ].join( '\n' );
    writeFileSync( okFile, fileContents );
    writeFileSync( nmFile, fileContents );
    writeFileSync( vendorFile, fileContents );

    const collected = [];
    for await ( const m of importComponents( matchFiles( root, [ v => v.endsWith( 'meta.module.js' ) ] ) ) ) {
      collected.push( m );
    }

    expect( collected.length ).toBe( 1 );
    expect( collected[0].path ).toBe( okFile );
  } );

  it( 'supports partial matching by folder name', async () => {
    const root = join( TEMP_BASE, `meta-${Date.now()}-foldermatch` );
    const okDir = join( root, 'features', 'ok' );
    const otherDir = join( root, 'features', 'other' );
    mkdirSync( okDir, { recursive: true } );
    mkdirSync( otherDir, { recursive: true } );

    const okFile = join( okDir, 'alpha.js' );
    const otherFile = join( otherDir, 'beta.js' );
    const src = [
      'import { METADATA_ACCESS_SYMBOL } from "#consts";',
      'export const X = () => {};',
      'X[METADATA_ACCESS_SYMBOL] = { kind: "step", name: "x" };'
    ].join( '\n' );
    writeFileSync( okFile, src );
    writeFileSync( otherFile, src );

    const matcher = v => v.includes( `${join( 'features', 'ok' )}${sep}` );
    const collected = [];
    for await ( const m of importComponents( matchFiles( root, [ matcher ] ) ) ) {
      collected.push( m );
    }
    expect( collected.length ).toBe( 1 );
    expect( collected[0].path ).toBe( okFile );
  } );

  it( 'follows symlinks to directories and collects matching files inside the target', async () => {
    const base = join( TEMP_BASE, `symlink-dir-${Date.now()}` );
    const targetDir = join( base, 'target' );
    const scanRoot = join( base, 'root' );
    mkdirSync( targetDir, { recursive: true } );
    mkdirSync( scanRoot, { recursive: true } );
    const moduleFile = join( targetDir, 'meta.module.js' );
    writeFileSync( moduleFile, [
      'import { METADATA_ACCESS_SYMBOL } from "#consts";',
      'export const ViaLink = () => {};',
      'ViaLink[METADATA_ACCESS_SYMBOL] = { kind: "step", name: "via_link" };'
    ].join( '\n' ) );

    symlinkSync( join( '..', 'target' ), join( scanRoot, 'pkg' ), 'dir' );

    const collected = [];
    for await ( const m of importComponents( matchFiles( scanRoot, [ v => v.endsWith( 'meta.module.js' ) ] ) ) ) {
      collected.push( m );
    }

    expect( collected.length ).toBe( 1 );
    expect( collected[0].path ).toBe( moduleFile );
    expect( collected[0].metadata.name ).toBe( 'via_link' );
  } );

  it( 'collects a symlinked file when the matcher matches the realpath target (canonical url)', async () => {
    const root = join( TEMP_BASE, `symlink-file-${Date.now()}` );
    mkdirSync( root, { recursive: true } );
    const realFile = join( root, 'real.module.js' );
    writeFileSync( realFile, [
      'import { METADATA_ACCESS_SYMBOL } from "#consts";',
      'export const R = () => {};',
      'R[METADATA_ACCESS_SYMBOL] = { kind: "step", name: "r" };'
    ].join( '\n' ) );
    const linkPath = join( root, 'alias.module.js' );
    symlinkSync( 'real.module.js', linkPath, 'file' );

    const collected = [];
    for await ( const m of importComponents( matchFiles( root, [ v => v.endsWith( '.module.js' ) ] ) ) ) {
      collected.push( m );
    }

    expect( collected.length ).toBe( 2 );
    expect( collected.every( m => m.metadata.name === 'r' ) ).toBe( true );
    expect( collected[0].fn ).toBe( collected[1].fn );
  } );
} );

describe( 'packageExposesWorkflows', () => {
  it( 'returns true when @outputai/config.workflows.expose is true', () => {
    const dir = join( TEMP_BASE, `wf-proj-expose-${Date.now()}` );
    mkdirSync( dir, { recursive: true } );
    const pkg = join( dir, 'package.json' );
    writeFileSync( pkg, JSON.stringify( { '@outputai/config': { workflows: { expose: true } } } ) );
    expect( packageExposesWorkflows( pkg ) ).toBe( true );
  } );

  it( 'returns false when @outputai/config.workflows.expose is false', () => {
    const dir = join( TEMP_BASE, `wf-proj-no-expose-${Date.now()}` );
    mkdirSync( dir, { recursive: true } );
    const pkg = join( dir, 'package.json' );
    writeFileSync( pkg, JSON.stringify( { '@outputai/config': { workflows: { expose: false } } } ) );
    expect( packageExposesWorkflows( pkg ) ).toBe( false );
  } );

  it( 'returns false for the legacy output.workflows.expose field', () => {
    const dir = join( TEMP_BASE, `wf-proj-legacy-expose-${Date.now()}` );
    mkdirSync( dir, { recursive: true } );
    const pkg = join( dir, 'package.json' );
    writeFileSync( pkg, JSON.stringify( { output: { workflows: { expose: true } } } ) );
    expect( packageExposesWorkflows( pkg ) ).toBe( false );
  } );

  it( 'returns false when only OutputAI dependencies are present', () => {
    const dir = join( TEMP_BASE, `wf-proj-dep-only-${Date.now()}` );
    mkdirSync( dir, { recursive: true } );
    const pkg = join( dir, 'package.json' );
    writeFileSync( pkg, JSON.stringify( { dependencies: { '@outputai/core': '1.0.0' } } ) );
    expect( packageExposesWorkflows( pkg ) ).toBe( false );
  } );

  it( 'returns false when package.json is missing', () => {
    expect( packageExposesWorkflows( join( TEMP_BASE, 'missing-package-json', 'package.json' ) ) ).toBe( false );
  } );

  it( 'returns false when package.json is not valid JSON', () => {
    const dir = join( TEMP_BASE, `wf-proj-badjson-${Date.now()}` );
    mkdirSync( dir, { recursive: true } );
    const pkg = join( dir, 'package.json' );
    writeFileSync( pkg, '{ not json' );
    expect( packageExposesWorkflows( pkg ) ).toBe( false );
  } );
} );

describe( 'findWorkflowsInNodeModules', () => {
  it( 'resolves node_modules from project root and finds workflows', () => {
    const root = join( TEMP_BASE, `nm-from-root-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const pkg = join( nm, 'pkg_a' );
    mkdirSync( join( pkg, 'w' ), { recursive: true } );
    writeFileSync( join( pkg, 'package.json' ), JSON.stringify( {
      name: 'pkg_a',
      '@outputai/config': { workflows: { expose: true } }
    } ) );
    const wf = join( pkg, 'w', 'workflow.js' );
    writeFileSync( wf, 'export default {};\n' );

    const found = findWorkflowsInNodeModules( root );
    expect( found.length ).toBe( 1 );
    expect( found[0].path ).toBe( wf );
  } );

  it( 'finds workflow.js under an unscoped package with exposed workflows', () => {
    const root = join( TEMP_BASE, `nm-unscoped-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const pkg = join( nm, 'catalog_pkg' );
    mkdirSync( join( pkg, 'workflows', 'a' ), { recursive: true } );
    writeFileSync( join( pkg, 'package.json' ), JSON.stringify( {
      name: 'catalog_pkg',
      '@outputai/config': { workflows: { expose: true } }
    } ) );
    writeFileSync( join( pkg, 'workflows', 'a', 'workflow.js' ), 'export default {};\n' );

    const found = findWorkflowsInNodeModules( nm );
    expect( found.length ).toBe( 1 );
    expect( found[0].path ).toBe( join( pkg, 'workflows', 'a', 'workflow.js' ) );
    expect( found[0].url ).toBe( pathToFileURL( join( pkg, 'workflows', 'a', 'workflow.js' ) ).href );
  } );

  it( 'finds workflow.js under a scoped package', () => {
    const root = join( TEMP_BASE, `nm-scoped-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const pkg = join( nm, '@acme', 'wf_pkg' );
    mkdirSync( join( pkg, 'lib' ), { recursive: true } );
    writeFileSync( join( pkg, 'package.json' ), JSON.stringify( {
      name: '@acme/wf_pkg',
      '@outputai/config': { workflows: { expose: true } }
    } ) );
    writeFileSync( join( pkg, 'lib', 'workflow.js' ), 'export default {};\n' );

    const found = findWorkflowsInNodeModules( nm );
    expect( found.length ).toBe( 1 );
    expect( found[0].path ).toBe( join( pkg, 'lib', 'workflow.js' ) );
  } );

  it( 'skips packages that do not expose workflows', () => {
    const root = join( TEMP_BASE, `nm-skip-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const pkg = join( nm, 'plain_lib' );
    mkdirSync( pkg, { recursive: true } );
    writeFileSync( join( pkg, 'package.json' ), JSON.stringify( { name: 'plain_lib' } ) );
    writeFileSync( join( pkg, 'workflow.js' ), 'export default {};\n' );

    expect( findWorkflowsInNodeModules( nm ) ).toEqual( [] );
  } );

  it( 'deduplicates the same workflow when reachable via symlink alias and canonical package', () => {
    const root = join( TEMP_BASE, `nm-dedupe-${Date.now()}` );
    const nm = join( root, 'node_modules' );
    const realPkg = join( nm, 'real_pkg' );
    const linkPkg = join( nm, 'link_pkg' );
    mkdirSync( join( realPkg, 'w' ), { recursive: true } );
    const wf = join( realPkg, 'w', 'workflow.js' );
    writeFileSync( join( realPkg, 'package.json' ), JSON.stringify( {
      name: 'real_pkg',
      '@outputai/config': { workflows: { expose: true } }
    } ) );
    writeFileSync( wf, 'export default {};\n' );
    symlinkSync( 'real_pkg', linkPkg, 'dir' );

    const found = findWorkflowsInNodeModules( nm );
    expect( found ).toHaveLength( 1 );
    expect( realpathSync( found[0].path ) ).toBe( wf );
  } );
} );

describe( 'findSharedActivitiesFromWorkflows', () => {
  it( 'finds shared steps and evaluators from external workflow package roots', () => {
    const root = join( TEMP_BASE, `external-shared-${Date.now()}` );
    const pkg = join( root, 'node_modules', '@acme', 'workflow_pkg' );
    const workflowA = join( pkg, 'workflows', 'a', 'workflow.js' );
    const workflowB = join( pkg, 'workflows', 'b', 'workflow.js' );
    const sharedStep = join( pkg, 'shared', 'steps', 'prepare.js' );
    const sharedEvaluator = join( pkg, 'shared', 'evaluators', 'quality.js' );
    mkdirSync( dirname( workflowA ), { recursive: true } );
    mkdirSync( dirname( workflowB ), { recursive: true } );
    mkdirSync( dirname( sharedStep ), { recursive: true } );
    mkdirSync( dirname( sharedEvaluator ), { recursive: true } );
    writeFileSync( join( pkg, 'package.json' ), JSON.stringify( {
      name: '@acme/workflow_pkg',
      dependencies: { '@outputai/core': '1.0.0' }
    } ) );
    writeFileSync( workflowA, 'export default {};\n' );
    writeFileSync( workflowB, 'export default {};\n' );
    writeFileSync( sharedStep, 'export const Prepare = step({ name: "prepare" });\n' );
    writeFileSync( sharedEvaluator, 'export const Quality = evaluator({ name: "quality" });\n' );
    writeFileSync( join( pkg, 'shared', 'readme.md' ), '# ignored\n' );

    const found = findSharedActivitiesFromWorkflows( [
      { path: workflowA },
      { path: workflowB },
      { path: join( root, 'local', 'workflow.js' ) }
    ] );
    expect( found.map( f => f.path ).sort() ).toEqual( [ sharedEvaluator, sharedStep ].sort() );
  } );
} );

describe( 'staticMatchers', () => {
  describe( 'workflowFile', () => {
    it( 'matches paths ending with path separator and workflow.js', () => {
      expect( staticMatchers.workflowFile( `${sep}x${sep}y${sep}workflow.js` ) ).toBe( true );
    } );

    it( 'rejects workflow.ts', () => {
      expect( staticMatchers.workflowFile( `${sep}a${sep}workflow.ts` ) ).toBe( false );
    } );
  } );

  describe( 'workflowPathHasShared', () => {
    it( 'matches workflow.js under a shared folder segment', () => {
      expect( staticMatchers.workflowPathHasShared( `${sep}foo${sep}shared${sep}workflow.js` ) ).toBe( true );
    } );

    it( 'rejects workflow.js not under shared', () => {
      expect( staticMatchers.workflowPathHasShared( `${sep}foo${sep}workflow.js` ) ).toBe( false );
    } );
  } );

  describe( 'sharedStepsDir', () => {
    it( 'matches .js files inside shared/steps/', () => {
      expect( staticMatchers.sharedStepsDir( `${sep}app${sep}dist${sep}shared${sep}steps${sep}tools.js` ) ).toBe( true );
    } );

    it( 'matches .js files in nested subdirectories of shared/steps/', () => {
      expect( staticMatchers.sharedStepsDir( `${sep}app${sep}dist${sep}shared${sep}steps${sep}utils${sep}helper.js` ) ).toBe( true );
    } );

    it( 'rejects .ts files inside shared/steps/', () => {
      expect( staticMatchers.sharedStepsDir( `${sep}app${sep}src${sep}shared${sep}steps${sep}tools.ts` ) ).toBe( false );
    } );

    it( 'rejects non-.js files inside shared/steps/', () => {
      expect( staticMatchers.sharedStepsDir( `${sep}app${sep}dist${sep}shared${sep}steps${sep}readme.md` ) ).toBe( false );
    } );
  } );

  describe( 'sharedEvaluatorsDir', () => {
    it( 'matches .js files inside shared/evaluators/', () => {
      expect( staticMatchers.sharedEvaluatorsDir( `${sep}app${sep}dist${sep}shared${sep}evaluators${sep}quality.js` ) ).toBe( true );
    } );

    it( 'matches .js files in nested subdirectories of shared/evaluators/', () => {
      expect( staticMatchers.sharedEvaluatorsDir( `${sep}app${sep}dist${sep}shared${sep}evaluators${sep}utils${sep}helper.js` ) ).toBe( true );
    } );

    it( 'rejects .ts files inside shared/evaluators/', () => {
      expect( staticMatchers.sharedEvaluatorsDir( `${sep}app${sep}src${sep}shared${sep}evaluators${sep}quality.ts` ) ).toBe( false );
    } );

    it( 'rejects non-.js files inside shared/evaluators/', () => {
      expect( staticMatchers.sharedEvaluatorsDir( `${sep}app${sep}dist${sep}shared${sep}evaluators${sep}readme.md` ) ).toBe( false );
    } );
  } );
} );
