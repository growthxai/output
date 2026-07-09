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
  it( 'rewrites ESM step imports to the global dispatcher and leaves workflow calls intact', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-esm-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepA = step({ name: \'step.a\' });' );
    writeFileSync( join( dir, 'workflow.js' ), `
export const FlowA = workflow({ name: 'flow.a' });
export default workflow({ name: 'flow.def' });` );

    const source = `
import { StepA } from './steps.js';
import FlowDef, { FlowA } from './workflow.js';

const obj = {
  fn: async (x) => {
    StepA(1);
    FlowA(2);
    FlowDef(3);
  }
}`;

    const { code } = await runLoader( source, join( dir, 'file.js' ) );

    expect( code ).not.toMatch( /from '\.\/steps\.js'/ );
    expect( code ).toMatch( /from '\.\/workflow\.js'/ );
    expect( code ).not.toMatch( /@outputai\/core\/invoker/ );
    expect( code ).toMatch( /fn:\s*async x =>/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.a' ) );
    expect( code ).toMatch( /,\s*1\)/ );
    expect( code ).toMatch( /FlowA\(2\)/ );
    expect( code ).toMatch( /FlowDef\(3\)/ );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rewrites ESM shared steps imports to the global dispatcher', async () => {
    // Create directory structure: shared/steps/common.js
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-esm-shared-' ) );
    mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync( join( dir, 'shared', 'steps', 'common.js' ), 'export const SharedA = step({ name: \'shared.a\' });' );

    const source = `
import { SharedA } from '../../shared/steps/common.js';

const obj = {
  fn: async (x) => {
    SharedA(1);
  }
}`;

    const { code } = await runLoader( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    expect( code ).not.toMatch( /from '\.\.\/\.\.\/shared\/steps\/common\.js'/ );
    expect( code ).toMatch( invokeActivityPattern( 'shared\\.a' ) );
    expect( code ).toMatch( /,\s*1\)/ );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rewrites CJS shared steps requires to the global dispatcher', async () => {
    // Create directory structure: shared/steps/common.js
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-cjs-shared-' ) );
    mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync( join( dir, 'shared', 'steps', 'common.js' ), 'export const SharedB = step({ name: \'shared.b\' });' );

    const source = `
const { SharedB } = require( '../../shared/steps/common.js' );

const obj = {
  fn: async (y) => {
    SharedB();
  }
}`;

    const { code } = await runLoader( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    expect( code ).not.toMatch( /require\('\.\.\/\.\.\/shared\/steps\/common\.js'\)/ );
    expect( code ).toMatch( invokeActivityPattern( 'shared\\.b' ) );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rewrites CJS step requires and leaves workflow calls intact', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-cjs-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepB = step({ name: \'step.b\' });' );
    writeFileSync( join( dir, 'workflow.js' ), 'export default workflow({ name: \'flow.c\' });' );

    const source = `
const { StepB } = require( './steps.js' );
const FlowDefault = require( './workflow.js' );

const obj = {
  fn: async (y) => {
    StepB();
    FlowDefault();
  }
}`;

    const { code } = await runLoader( source, join( dir, 'file.js' ) );

    expect( code ).not.toMatch( /require\('\.\/steps\.js'\)/ );
    expect( code ).toMatch( /require\('\.\/workflow\.js'\)/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.b' ) );
    expect( code ).toMatch( /FlowDefault\(\)/ );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves top-level const name variables', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-const-' ) );
    writeFileSync( join( dir, 'steps.js' ), `
const NAME = 'step.const';
export const StepC = step({ name: NAME });` );
    writeFileSync( join( dir, 'workflow.js' ), `
const WF = 'wf.const';
export const FlowC = workflow({ name: WF });
const D = 'wf.def';
export default workflow({ name: D });` );

    const source = `
import { StepC } from './steps.js';
import FlowDef, { FlowC } from './workflow.js';
const obj = { fn: async () => { StepC(); FlowC(); FlowDef(); } }`;

    const { code } = await runLoader( source, join( dir, 'file.js' ) );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.const' ) );
    expect( code ).toMatch( /FlowC\(\)/ );
    expect( code ).toMatch( /FlowDef\(\)/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rewrites ESM shared evaluator imports to the global dispatcher', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-esm-shared-eval-' ) );
    mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync( join( dir, 'shared', 'evaluators', 'common.js' ), 'export const SharedEval = evaluator({ name: \'shared.eval\' });' );

    const source = `
import { SharedEval } from '../../shared/evaluators/common.js';

const obj = {
  fn: async (x) => {
    SharedEval(1);
  }
}`;

    const { code } = await runLoader( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    expect( code ).not.toMatch( /from '\.\.\/\.\.\/shared\/evaluators\/common\.js'/ );
    expect( code ).toMatch( invokeActivityPattern( 'shared\\.eval' ) );
    expect( code ).toMatch( /,\s*1\)/ );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rewrites CJS shared evaluator requires to the global dispatcher', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-cjs-shared-eval-' ) );
    mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync( join( dir, 'shared', 'evaluators', 'common.js' ), 'export const SharedEval = evaluator({ name: \'shared.eval\' });' );

    const source = `
const { SharedEval } = require( '../../shared/evaluators/common.js' );

const obj = {
  fn: async (y) => {
    SharedEval();
  }
}`;

    const { code } = await runLoader( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    expect( code ).not.toMatch( /require\('\.\.\/\.\.\/shared\/evaluators\/common\.js'\)/ );
    expect( code ).toMatch( invokeActivityPattern( 'shared\\.eval' ) );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rewrites helper modules without requiring workflow fn objects', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-helper-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepA = step({ name: \'step.helper\' });' );

    const source = `
import { StepA } from './steps.js';

export const helper = async value => StepA(value);`;

    const { code } = await runLoader( source, join( dir, 'helper.js' ) );

    expect( code ).toMatch( invokeActivityPattern( 'step\\.helper' ) );
    expect( code ).toMatch( /,\s*value\)/ );
    expect( code ).toMatch( /export const helper = async value =>/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'does not need aliases when local invoke names are taken', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-collision-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepA = step({ name: \'step.collision\' });' );

    const source = `
import { StepA } from './steps.js';
const __invokeActivity = () => null;
const _invokeActivity = () => null;
export function helper() {
  return StepA();
}`;

    const { code } = await runLoader( source, join( dir, 'helper.js' ) );

    expect( code ).not.toMatch( /@outputai\/core\/invoker/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.collision' ) );
    expect( code ).toMatch( /const __invokeActivity = \(\) => null/ );
    expect( code ).toMatch( /const _invokeActivity = \(\) => null/ );
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

  it( 'throws on non-static name', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'ast-loader-error-' ) );
    writeFileSync( join( dir, 'steps.js' ), `
function n() { return 'x'; }
export const StepX = step({ name: n() });` );
    writeFileSync( join( dir, 'workflow.js' ), `
const base = 'a';
export default workflow({ name: \`\${base}-b\` });` );

    const source = `
import { StepX } from './steps.js';
import WF from './workflow.js';
const obj = { fn: async () => { StepX(); WF(); } }`;

    await expect( runLoader( source, join( dir, 'file.js' ) ) ).rejects.toThrow( /Invalid step name/ );
    rmSync( dir, { recursive: true, force: true } );
  } );
} );
