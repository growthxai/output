import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import loader from './index.mjs';

const { invokeActivitySymbolKey } = vi.hoisted( () => ( {
  invokeActivitySymbolKey: 'test:invoke_activity'
} ) );

vi.mock( '#consts', async importOriginal => ( {
  ...await importOriginal(),
  INVOKE_ACTIVITY_SYMBOL: Symbol.for( invokeActivitySymbolKey )
} ) );

function runLoader( source, resourcePath ) {
  return new Promise( ( resolve, reject ) => {
    const ctx = {
      resourcePath,
      cacheable: () => {},
      async: () => ( err, code, map ) => ( err ? reject( err ) : resolve( { code, map } ) ),
      callback: ( err, code, map ) => ( err ? reject( err ) : resolve( { code, map } ) )
    };
    loader.call( ctx, source, null );
  } );
}

const escapeRegExp = value => value.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
const invokeActivityPattern = activityName =>
  new RegExp( `globalThis\\[globalThis\\.Symbol\\.for\\(([\"'])${escapeRegExp( invokeActivitySymbolKey )}\\1\\)\\]\\('${activityName}'` );

describe( 'workflows_rewriter Webpack loader spec', () => {
  it( 'rewrites ESM activity imports and leaves workflow imports intact', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-esm-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepA = step({ name: \'step.a\' });' );
    writeFileSync( join( dir, 'workflow.js' ), `
export const FlowA = workflow({ name: 'flow.a' });
export default workflow({ name: 'flow.def' });` );

    const source = `
import { StepA } from './steps.js';
import FlowDef, { FlowA } from './workflow.js';

const obj = {
  fn: async x => {
    StepA(1);
    FlowA(2);
    FlowDef(3);
  }
}`;

    const { code } = await runLoader( source, join( dir, 'file.js' ) );

    expect( code ).not.toMatch( /from '\.\/steps\.js'/ );
    expect( code ).toMatch( /from '\.\/workflow\.js'/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.a' ) );
    expect( code ).toMatch( /,\s*1\)/ );
    expect( code ).toMatch( /FlowA\(2\)/ );
    expect( code ).toMatch( /FlowDef\(3\)/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rewrites CJS activity requires and leaves workflow requires intact', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-cjs-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepB = step({ name: \'step.b\' });' );
    writeFileSync( join( dir, 'workflow.js' ), 'export default workflow({ name: \'flow.c\' });' );

    const source = `
const { StepB } = require( './steps.js' );
const FlowDefault = require( './workflow.js' );

const obj = {
  fn: async y => {
    StepB(y);
    FlowDefault();
  }
}`;

    const { code } = await runLoader( source, join( dir, 'file.js' ) );

    expect( code ).not.toMatch( /require\('\.\/steps\.js'\)/ );
    expect( code ).toMatch( /require\('\.\/workflow\.js'\)/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.b' ) );
    expect( code ).toMatch( /,\s*y\)/ );
    expect( code ).toMatch( /FlowDefault\(\)/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rewrites shared activity imports from helper modules', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-shared-helper-' ) );
    mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync(
      join( dir, 'shared', 'evaluators', 'common.js' ),
      'export const SharedEval = evaluator({ name: \'shared.eval\' });'
    );

    const source = `
import { SharedEval } from '../../shared/evaluators/common.js';

export const helper = async value => SharedEval(value);`;

    const { code } = await runLoader( source, join( dir, 'workflows', 'my_workflow', 'helper.js' ) );

    expect( code ).not.toMatch( /shared\/evaluators\/common\.js/ );
    expect( code ).toMatch( invokeActivityPattern( 'shared\\.eval' ) );
    expect( code ).toMatch( /,\s*value\)/ );
    expect( code ).toMatch( /export const helper = async value =>/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves top-level const activity names', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-const-' ) );
    writeFileSync( join( dir, 'steps.js' ), `
const NAME = 'step.const';
export const StepC = step({ name: NAME });` );

    const source = `
import { StepC } from './steps.js';
const obj = { fn: async () => StepC() };`;

    const { code } = await runLoader( source, join( dir, 'file.js' ) );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.const' ) );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'throws when globalThis is shadowed at a rewritten call site', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-globalthis-shadow-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepA = step({ name: \'step.shadow\' });' );

    const source = `
import { StepA } from './steps.js';
export function helper(globalThis) {
  return StepA();
}`;

    await expect( runLoader( source, join( dir, 'helper.js' ) ) ).rejects.toThrow( /globalThis.*shadowed/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'propagates errors for non-static activity names', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-error-' ) );
    writeFileSync( join( dir, 'steps.js' ), `
function n() { return 'x'; }
export const StepX = step({ name: n() });` );

    const source = `
import { StepX } from './steps.js';
const obj = { fn: async () => StepX() };`;

    await expect( runLoader( source, join( dir, 'file.js' ) ) ).rejects.toThrow( /Invalid step name/ );
    rmSync( dir, { recursive: true, force: true } );
  } );
} );
