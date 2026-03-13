import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { importComponents, staticMatchers } from './loader_tools.js';

describe( '.importComponents', () => {
  const TEMP_BASE = join( process.cwd(), 'sdk/core/temp_test_modules' );
  afterEach( () => {
    rmSync( TEMP_BASE, { recursive: true, force: true } );
  } );
  it( 'imports modules and yields metadata from exports tagged with METADATA_ACCESS_SYMBOL', async () => {
    const root = join( process.cwd(), 'sdk/core/temp_test_modules', `meta-${Date.now()}` );
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
    for await ( const m of importComponents( root, [ v => v.endsWith( 'meta.module.js' ) ] ) ) {
      collected.push( m );
    }

    expect( collected.length ).toBe( 2 );
    expect( collected.map( m => m.metadata.name ).sort() ).toEqual( [ 'a', 'b' ] );
    expect( collected.map( m => m.metadata.kind ).sort() ).toEqual( [ 'step', 'workflow' ] );
    for ( const m of collected ) {
      expect( m.path ).toBe( file );
      expect( typeof m.fn ).toBe( 'function' );
    }

    rmSync( root, { recursive: true, force: true } );
  } );

  it( 'ignores exports without metadata symbol', async () => {
    const root = join( process.cwd(), 'sdk/core/temp_test_modules', `meta-${Date.now()}-nometa` );
    mkdirSync( root, { recursive: true } );
    const file = join( root, 'meta.module.js' );
    writeFileSync( file, [
      'export const Plain = () => {};',
      'export const AlsoPlain = {}'
    ].join( '\n' ) );

    const collected = [];
    for await ( const m of importComponents( root, [ v => v.endsWith( 'meta.module.js' ) ] ) ) {
      collected.push( m );
    }

    expect( collected.length ).toBe( 0 );
    rmSync( root, { recursive: true, force: true } );
  } );

  it( 'skips files inside ignored directories (node_modules, vendor)', async () => {
    const root = join( process.cwd(), 'sdk/core/temp_test_modules', `meta-${Date.now()}-ignoredirs` );
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
    for await ( const m of importComponents( root, [ v => v.endsWith( 'meta.module.js' ) ] ) ) {
      collected.push( m );
    }

    expect( collected.length ).toBe( 1 );
    expect( collected[0].path ).toBe( okFile );

    rmSync( root, { recursive: true, force: true } );
  } );

  it( 'supports partial matching by folder name', async () => {
    const root = join( process.cwd(), 'sdk/core/temp_test_modules', `meta-${Date.now()}-foldermatch` );
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

    // Match any JS under a folder named "ok"
    const matcher = v => v.includes( `${join( 'features', 'ok' )}${sep}` );
    const collected = [];
    for await ( const m of importComponents( root, [ matcher ] ) ) {
      collected.push( m );
    }
    expect( collected.length ).toBe( 1 );
    expect( collected[0].path ).toBe( okFile );

    rmSync( root, { recursive: true, force: true } );
  } );
} );

describe( '.staticMatchers', () => {
  describe( '.sharedStepsDir', () => {
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

  describe( '.sharedEvaluatorsDir', () => {
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
