import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import validatorLoader from './index.mjs';

const writeMockGrowthxlabsCatalog = ( dir, workflowName ) => {
  const pkgRoot = join( dir, 'node_modules', '@growthxlabs', 'workflows_catalog' );
  const srcDir = join( pkgRoot, 'src' );
  mkdirSync( join( srcDir, 'workflows', 'wf' ), { recursive: true } );
  writeFileSync( join( pkgRoot, 'package.json' ), JSON.stringify( {
    name: '@growthxlabs/workflows_catalog',
    type: 'module',
    main: './src/index.js',
    dependencies: { '@outputai/core': '1.0.0' }
  } ) );
  writeFileSync( join( srcDir, 'index.js' ), 'export { default as sumNumbers } from \'./workflows/wf/workflow.js\';\n' );
  writeFileSync(
    join( srcDir, 'workflows', 'wf', 'workflow.js' ),
    `export default workflow({ name: '${workflowName}' });\n`
  );
};

function runLoader( filename, source ) {
  return new Promise( ( resolve, reject ) => {
    const warnings = [];
    const ctx = {
      resourcePath: filename,
      cacheable: () => {},
      emitWarning: err => warnings.push( err ),
      async: () => ( err, code, map ) => ( err ? reject( err ) : resolve( { code, map, warnings } ) ),
      callback: ( err, code, map ) => ( err ? reject( err ) : resolve( { code, map, warnings } ) )
    };
    validatorLoader.call( ctx, source, null );
  } );
}

describe( 'workflow_validator loader', () => {
  it( 'allows supported workflow imports and arbitrary non-component imports', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-imports-allow-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const S = step({ name: "s" })\n' );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const E = evaluator({ name: "e" })\n' );
    writeFileSync( join( dir, 'workflow.js' ), 'export const W = workflow({ name: "w" })\n' );
    mkdirSync( join( dir, 'utils' ) );
    writeFileSync( join( dir, 'utils', 'helper.js' ), 'export const helper = () => 1;\n' );

    const source = [
      'import { S } from "./steps.js";',
      'import { E } from "./evaluators.js";',
      'import { W } from "./workflow.js";',
      'import { helper } from "./utils/helper.js";',
      'const x = 1;'
    ].join( '\n' );

    await expect( runLoader( join( dir, 'workflow.js' ), source ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'allows cross-component imports and requires in activity files', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'activity-cross-imports-' ) );
    const stepsResult = await runLoader( join( dir, 'steps.js' ), [
      'import { E } from "./evaluators.js";',
      'const W = require("./workflow.js");'
    ].join( '\n' ) );
    const evaluatorResult = await runLoader( join( dir, 'evaluators.js' ), [
      'import { S } from "./steps.js";',
      'const util = require("./util.js");'
    ].join( '\n' ) );

    expect( stepsResult.warnings ).toHaveLength( 0 );
    expect( evaluatorResult.warnings ).toHaveLength( 0 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rejects default and namespace imports from activity files', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'activity-import-shape-' ) );

    await expect( runLoader( join( dir, 'workflow.js' ), 'import StepA from "./steps.js";' ) )
      .rejects.toThrow( /Invalid activity import.*named imports only/ );
    await expect( runLoader( join( dir, 'workflow.js' ), 'import * as steps from "./steps.js";' ) )
      .rejects.toThrow( /Invalid activity import.*named imports only/ );
    await expect( runLoader( join( dir, 'workflow.js' ), 'import EvalA, { EvalB } from "./evaluators.js";' ) )
      .rejects.toThrow( /Invalid activity import.*named imports only/ );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rejects non-destructured requires from activity files', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'activity-require-shape-' ) );

    await expect( runLoader( join( dir, 'workflow.js' ), 'const steps = require("./steps.js");' ) )
      .rejects.toThrow( /Invalid activity require.*destructured requires only/ );
    await expect( runLoader( join( dir, 'workflow.js' ), 'const evaluators = require("./evaluators.js");' ) )
      .rejects.toThrow( /Invalid activity require.*destructured requires only/ );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rejects non-named exports from activity files', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'activity-export-shape-' ) );

    await expect( runLoader( join( dir, 'steps.js' ), 'export default step({ name: "a" });' ) )
      .rejects.toThrow( /Invalid activity export.*named exports only/ );
    await expect( runLoader( join( dir, 'evaluators.js' ), 'export * from "./other_evaluators.js";' ) )
      .rejects.toThrow( /Invalid activity export.*named exports only/ );
    await expect( runLoader( join( dir, 'steps.js' ), 'export const A = step({ name: "a" });' ) )
      .resolves.toBeTruthy();

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rejects top-level activity calls but allows calls inside helper functions', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'top-level-activity-calls-' ) );

    await expect( runLoader( join( dir, 'steps.js' ), 'const A = step({ name: "a" });\nA();' ) )
      .rejects.toThrow( /Invalid top-level step call 'A'/ );
    await expect( runLoader( join( dir, 'evaluators.js' ), 'const E = evaluator({ name: "e" });\nE();' ) )
      .rejects.toThrow( /Invalid top-level evaluator call 'E'/ );
    await expect( runLoader( join( dir, 'steps.js' ), 'const A = step({ name: "a" });\nfunction helper() { return A(); }' ) )
      .resolves.toBeTruthy();

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'warns when activity fn bodies call activities or workflows', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'activity-fn-call-warnings-' ) );
    writeMockGrowthxlabsCatalog( dir, 'cat.warn' );

    const stepResult = await runLoader( join( dir, 'steps.js' ), [
      'const A = step({ name: "a" });',
      'const B = step({ name: "b" });',
      'const obj = { fn: function() { B(); } };'
    ].join( '\n' ) );
    const evaluatorResult = await runLoader( join( dir, 'evaluators.js' ), [
      'import { sumNumbers } from "@growthxlabs/workflows_catalog";',
      'const E = evaluator({ name: "e", fn: async () => ({ value: 1 }) });',
      'const obj = { fn: function() { sumNumbers(); } };'
    ].join( '\n' ) );

    expect( stepResult.warnings ).toHaveLength( 1 );
    expect( stepResult.warnings[0].message ).toMatch( /Invalid call in .*steps\.js fn: calling a step/ );
    expect( evaluatorResult.warnings ).toHaveLength( 1 );
    expect( evaluatorResult.warnings[0].message ).toMatch( /Invalid call in .*evaluators\.js fn: calling a workflow/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'allows component instantiation in matching files', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'instantiation-allowed-' ) );
    mkdirSync( join( dir, 'steps' ) );
    mkdirSync( join( dir, 'evaluators' ) );

    await expect( runLoader(
      join( dir, 'steps', 'fetch_data.js' ),
      'export const fetchData = step({ name: "fetch_data", fn: async () => ({}) });'
    ) ).resolves.toBeTruthy();
    await expect( runLoader(
      join( dir, 'evaluators', 'quality.js' ),
      'export const quality = evaluator({ name: "quality", fn: async () => ({ value: 1 }) });'
    ) ).resolves.toBeTruthy();
    await expect( runLoader(
      join( dir, 'workflow.js' ),
      'export default workflow({ name: "wf", fn: async () => ({}) });'
    ) ).resolves.toBeTruthy();

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rejects component instantiation in mismatched files', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'instantiation-rejected-' ) );
    mkdirSync( join( dir, 'shared' ) );

    await expect( runLoader(
      join( dir, 'utils.js' ),
      'export const badStep = step({ name: "bad", fn: async () => ({}) });'
    ) ).rejects.toThrow( /Invalid instantiation location.*step\(\).*steps/ );
    await expect( runLoader(
      join( dir, 'steps.js' ),
      'export const badEval = evaluator({ name: "bad", fn: async () => ({ value: 1 }) });'
    ) ).rejects.toThrow( /Invalid instantiation location.*evaluator\(\).*evaluators/ );
    await expect( runLoader(
      join( dir, 'shared', 'common.js' ),
      'export const badWf = workflow({ name: "bad", fn: async () => ({}) });'
    ) ).rejects.toThrow( /Invalid instantiation location.*workflow\(\).*workflow/ );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves bare npm workflows for require warnings in activity fn bodies', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'bare-require-workflow-warning-' ) );
    writeMockGrowthxlabsCatalog( dir, 'cat.warn.req' );

    const result = await runLoader( join( dir, 'evaluators.js' ), [
      'const { sumNumbers } = require("@growthxlabs/workflows_catalog");',
      'const E = evaluator({ name: "e", fn: async () => ({ value: 1 }) });',
      'const obj = { fn: function() { sumNumbers(); } };'
    ].join( '\n' ) );

    expect( result.warnings ).toHaveLength( 1 );
    expect( result.warnings[0].message ).toMatch( /Invalid call in .*evaluators\.js fn: calling a workflow/ );
    rmSync( dir, { recursive: true, force: true } );
  } );
} );
