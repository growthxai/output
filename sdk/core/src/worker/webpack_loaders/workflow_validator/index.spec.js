import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import validatorLoader from './index.mjs';

/**
 * Minimal published catalog under `dir/node_modules` so `require.resolve` / export following works.
 * @param {string} dir - Temp project root containing `steps.js` / `workflow.js` under test.
 * @param {string} workflowName - Declared workflow `name` in the leaf `workflow.js`.
 */
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
  it( 'workflow.js: allows imports from steps/evaluators/workflow', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-allow-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const S = step({ name: "s" })\n' );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const E = evaluator({ name: "e" })\n' );
    writeFileSync( join( dir, 'workflow.js' ), 'export const W = workflow({ name: "w" })\n' );

    const src = [
      'import { S } from "./steps.js";',
      'import { E } from "./evaluators.js";',
      'import { W } from "./workflow.js";',
      'const x = 1;'
    ].join( '\n' );

    await expect( runLoader( join( dir, 'workflow.js' ), src ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'workflow.js: rejects default and namespace imports from activity files', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-activity-import-shape-' ) );
    await expect(
      runLoader( join( dir, 'workflow.js' ), 'import StepA from "./steps.js";' )
    ).rejects.toThrow( /Invalid activity import.*named imports only/ );
    await expect(
      runLoader( join( dir, 'workflow.js' ), 'import * as steps from "./steps.js";' )
    ).rejects.toThrow( /Invalid activity import.*named imports only/ );
    await expect(
      runLoader( join( dir, 'workflow.js' ), 'import EvalA, { EvalB } from "./evaluators.js";' )
    ).rejects.toThrow( /Invalid activity import.*named imports only/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'workflow.js: allows imports from any non-component file', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-any-allow-' ) );
    const src = 'import x from "./foo.js";';
    await expect( runLoader( join( dir, 'workflow.js' ), src ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'workflow.js: allows imports from @outputai/core', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-allow-external-' ) );
    const src = [
      'import a from "@outputai/core";',
      'const z = 1;'
    ].join( '\n' );
    await expect( runLoader( join( dir, 'workflow.js' ), src ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'steps.js: allows importing steps/evaluators/workflow (no import restrictions)', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'steps-allow-import-' ) );
    const src = 'import { S } from "./steps.js";';
    const result = await runLoader( join( dir, 'steps.js' ), src );
    expect( result.warnings ).toHaveLength( 0 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'steps.js: allows other imports', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'steps-allow-' ) );
    const src = 'import x from "./util.js";\nconst obj = { fn: () => 1 };';
    await expect( runLoader( join( dir, 'steps.js' ), src ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'evaluators.js: allows importing evaluators/steps/workflow (no import restrictions)', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'evals-allow-import-' ) );
    const src = 'import { E } from "./evaluators.js";';
    const result = await runLoader( join( dir, 'evaluators.js' ), src );
    expect( result.warnings ).toHaveLength( 0 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'steps.js/evaluators.js: rejects non-named activity exports', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'activity-export-shape-' ) );
    await expect(
      runLoader( join( dir, 'steps.js' ), 'export default step({ name: "a" });' )
    ).rejects.toThrow( /Invalid activity export.*named exports only/ );
    await expect(
      runLoader( join( dir, 'evaluators.js' ), 'export * from "./other_evaluators.js";' )
    ).rejects.toThrow( /Invalid activity export.*named exports only/ );
    await expect(
      runLoader( join( dir, 'steps.js' ), 'export const A = step({ name: "a" });' )
    ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'steps.js: warns when calling imported catalog workflow inside fn', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'steps-catalog-warn-' ) );
    writeMockGrowthxlabsCatalog( dir, 'cat.warn' );
    const src = [
      'import { sumNumbers } from "@growthxlabs/workflows_catalog";',
      'const A = step({ name: "a", fn: async () => ({}) });',
      'const obj = { fn: function() { sumNumbers(); } };'
    ].join( '\n' );
    const result = await runLoader( join( dir, 'steps.js' ), src );
    expect( result.warnings ).toHaveLength( 1 );
    expect( result.warnings[0].message ).toMatch( /Invalid call in .*steps\.js fn: calling a workflow/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'evaluators.js: warns when calling catalog workflow inside fn (require)', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'evals-catalog-warn-' ) );
    writeMockGrowthxlabsCatalog( dir, 'cat.warn.req' );
    const src = [
      'const { sumNumbers } = require("@growthxlabs/workflows_catalog");',
      'const E = evaluator({ name: "e", fn: async () => ({ value: 1 }) });',
      'const obj = { fn: function() { sumNumbers(); } };'
    ].join( '\n' );
    const result = await runLoader( join( dir, 'evaluators.js' ), src );
    expect( result.warnings ).toHaveLength( 1 );
    expect( result.warnings[0].message ).toMatch( /Invalid call in .*evaluators\.js fn: calling a workflow/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'workflow.js: allows import from @growthxlabs/workflows_catalog', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-catalog-allow-' ) );
    writeMockGrowthxlabsCatalog( dir, 'cat.allow' );
    const src = [
      'import { sumNumbers } from "@growthxlabs/workflows_catalog";',
      'const x = 1;'
    ].join( '\n' );
    const result = await runLoader( join( dir, 'workflow.js' ), src );
    expect( result.warnings ).toHaveLength( 0 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'steps.js: warns when calling another step inside fn', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'steps-call-reject-' ) );
    // Can only test same-type components since cross-type declarations are now blocked by instantiation validation
    const src = [
      'const A = step({ name: "a" });',
      'const B = step({ name: "b" });',
      'const obj = { fn: function() { B(); } };'
    ].join( '\n' );
    const result = await runLoader( join( dir, 'steps.js' ), src );
    expect( result.warnings ).toHaveLength( 1 );
    expect( result.warnings[0].message ).toMatch( /Invalid call in .*\.js fn/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'evaluators.js: warns when calling another evaluator inside fn', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'evals-call-reject-' ) );
    // Can only test same-type components since cross-type declarations are now blocked by instantiation validation
    const src = [
      'const E1 = evaluator({ name: "e1" });',
      'const E2 = evaluator({ name: "e2" });',
      'const obj = { fn: function() { E2(); } };'
    ].join( '\n' );
    const result = await runLoader( join( dir, 'evaluators.js' ), src );
    expect( result.warnings ).toHaveLength( 1 );
    expect( result.warnings[0].message ).toMatch( /Invalid call in .*\.js fn/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'steps.js/evaluators.js: allows calling unrelated local functions in fn', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'fn-allow-' ) );
    const stepsSrc = [
      'function helper() { return 1; }',
      'const obj = { fn: function() { helper(); } };'
    ].join( '\n' );
    await expect( runLoader( join( dir, 'steps.js' ), stepsSrc ) ).resolves.toBeTruthy();

    const evalsSrc = [
      'function helper() { return 1; }',
      'const obj = { fn: () => { helper(); } };'
    ].join( '\n' );
    await expect( runLoader( join( dir, 'evaluators.js' ), evalsSrc ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'workflow.js: allows require from steps/evaluators/workflow; allows other require', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-req-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const S = step({ name: "s" })\n' );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const E = evaluator({ name: "e" })\n' );
    writeFileSync( join( dir, 'workflow.js' ), 'export default workflow({ name: "w" })\n' );
    const ok = [
      'const { S } = require("./steps.js");',
      'const { E } = require("./evaluators.js");',
      'const W = require("./workflow.js");'
    ].join( '\n' );
    await expect( runLoader( join( dir, 'workflow.js' ), ok ) ).resolves.toBeTruthy();
    // Also allow random files (not rejected anymore)
    const ok2 = 'const X = require("./random_file.js");';
    await expect( runLoader( join( dir, 'workflow.js' ), ok2 ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'workflow.js: rejects non-destructured requires from activity files', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-activity-require-shape-' ) );
    await expect(
      runLoader( join( dir, 'workflow.js' ), 'const steps = require("./steps.js");' )
    ).rejects.toThrow( /Invalid activity require.*destructured requires only/ );
    await expect(
      runLoader( join( dir, 'workflow.js' ), 'const evaluators = require("./evaluators.js");' )
    ).rejects.toThrow( /Invalid activity require.*destructured requires only/ );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'steps.js: allows importing evaluators/workflow variants (no import restrictions)', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'steps-allow-import2-' ) );
    const result1 = await runLoader( join( dir, 'steps.js' ), 'import { E } from "./evaluators.js";' );
    expect( result1.warnings ).toHaveLength( 0 );
    const result2 = await runLoader( join( dir, 'steps.js' ), 'import WF from "./workflow.js";' );
    expect( result2.warnings ).toHaveLength( 0 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'evaluators.js: allows importing steps/workflow variants (no import restrictions)', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'evals-allow-import2-' ) );
    const result1 = await runLoader( join( dir, 'evaluators.js' ), 'import { S } from "./steps.js";' );
    expect( result1.warnings ).toHaveLength( 0 );
    const result2 = await runLoader( join( dir, 'evaluators.js' ), 'import WF from "./workflow.js";' );
    expect( result2.warnings ).toHaveLength( 0 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'rejects top-level activity calls in steps.js and evaluators.js', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'toplevel-reject-' ) );
    const stepsTop = [ 'const A = step({ name: "a" });', 'A();' ].join( '\n' );
    await expect( runLoader( join( dir, 'steps.js' ), stepsTop ) ).rejects.toThrow( /Invalid top-level step call 'A'/ );
    const evaluatorsTop = [ 'const E = evaluator({ name: "e" });', 'E();' ].join( '\n' );
    await expect( runLoader( join( dir, 'evaluators.js' ), evaluatorsTop ) ).rejects.toThrow(
      /Invalid top-level evaluator call 'E'/
    );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'allows activity calls inside helper functions', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'function-call-allowed-' ) );
    const stepsSrc = [ 'const A = step({ name: "a" });', 'function helper() { return A(); }' ].join( '\n' );
    await expect( runLoader( join( dir, 'steps.js' ), stepsSrc ) ).resolves.toBeTruthy();
    const evaluatorsSrc = [ 'const E = evaluator({ name: "e" });', 'const helper = () => E();' ].join( '\n' );
    await expect( runLoader( join( dir, 'evaluators.js' ), evaluatorsSrc ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'workflow.js: allows importing ./types.js and bare types', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-types-allow-' ) );
    writeFileSync( join( dir, 'types.js' ), 'export const T = {}\n' );
    const src1 = 'import { T } from "./types.js";';
    await expect( runLoader( join( dir, 'workflow.js' ), src1 ) ).resolves.toBeTruthy();
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'workflow.js: allows importing any file (consts/constants/vars/variables/random)', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'wf-extra-allow-' ) );
    const bases = [ 'consts', 'constants', 'vars', 'variables', 'random', 'anything' ];
    for ( const base of bases ) {
      writeFileSync( join( dir, `${base}.js` ), 'export const X = 1\n' );
      const src = `import x from "./${base}.js";`;
      await expect( runLoader( join( dir, 'workflow.js' ), src ) ).resolves.toBeTruthy();
    }
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'steps.js: allows require of steps/evaluators/workflow (no import restrictions)', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'steps-require-allow-' ) );
    const result1 = await runLoader( join( dir, 'steps.js' ), 'const { S } = require("./steps.js");' );
    expect( result1.warnings ).toHaveLength( 0 );
    const result2 = await runLoader( join( dir, 'steps.js' ), 'const { E } = require("./evaluators.js");' );
    expect( result2.warnings ).toHaveLength( 0 );
    const result3 = await runLoader( join( dir, 'steps.js' ), 'const W = require("./workflow.js");' );
    expect( result3.warnings ).toHaveLength( 0 );
    const ok = 'const util = require("./util.js");';
    const resultOk = await runLoader( join( dir, 'steps.js' ), ok );
    expect( resultOk.warnings ).toHaveLength( 0 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'evaluators.js: allows require of steps/workflow (no import restrictions)', async () => {
    const dir = mkdtempSync( join( tmpdir(), 'evals-require-allow-' ) );
    const result1 = await runLoader( join( dir, 'evaluators.js' ), 'const { S } = require("./steps.js");' );
    expect( result1.warnings ).toHaveLength( 0 );
    const result2 = await runLoader( join( dir, 'evaluators.js' ), 'const W = require("./workflow.js");' );
    expect( result2.warnings ).toHaveLength( 0 );
    const ok = 'const util = require("./util.js");';
    const resultOk = await runLoader( join( dir, 'evaluators.js' ), ok );
    expect( resultOk.warnings ).toHaveLength( 0 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  // =====================================================
  // Folder-based utilities and shared directory
  // =====================================================

  describe( 'folder-based utilities', () => {
    it( 'workflow.js: allows imports from ./utils/helper.js (folder-based utils)', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-folder-utils-' ) );
      mkdirSync( join( dir, 'utils' ) );
      writeFileSync( join( dir, 'utils', 'helper.js' ), 'export const helper = () => 1;\n' );
      const src = 'import { helper } from "./utils/helper.js";';
      await expect( runLoader( join( dir, 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow.js: allows imports from ./clients/redis.js (folder-based clients)', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-folder-clients-' ) );
      mkdirSync( join( dir, 'clients' ) );
      writeFileSync( join( dir, 'clients', 'redis.js' ), 'export const client = {};\n' );
      const src = 'import { client } from "./clients/redis.js";';
      await expect( runLoader( join( dir, 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'steps/fetch_data.js: allows imports from ../utils/http.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'steps-folder-utils-' ) );
      mkdirSync( join( dir, 'steps' ) );
      mkdirSync( join( dir, 'utils' ) );
      writeFileSync( join( dir, 'utils', 'http.js' ), 'export const get = () => {};\n' );
      const src = 'import { get } from "../utils/http.js";';
      await expect( runLoader( join( dir, 'steps', 'fetch_data.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluators/quality.js: allows imports from ../utils/metrics.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'evals-folder-utils-' ) );
      mkdirSync( join( dir, 'evaluators' ) );
      mkdirSync( join( dir, 'utils' ) );
      writeFileSync( join( dir, 'utils', 'metrics.js' ), 'export const compute = () => {};\n' );
      const src = 'import { compute } from "../utils/metrics.js";';
      await expect( runLoader( join( dir, 'evaluators', 'quality.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );
  } );

  describe( 'shared directory imports', () => {
    it( 'workflow.js: allows imports from ../../shared/utils/keys.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-shared-utils-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'utils' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'utils', 'keys.js' ), 'export const KEY = "test";\n' );
      const src = 'import { KEY } from "../../shared/utils/keys.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow.js: allows imports from ../../shared/steps/common.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-shared-steps-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'steps', 'common.js' ), 'export const commonStep = step({ name: "common" });\n' );
      const src = 'import { commonStep } from "../../shared/steps/common.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow.js: allows imports from ../../shared/evaluators/quality.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-shared-evals-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'evaluators', 'quality.js' ), 'export const qualityEval = evaluator({ name: "quality" });\n' );
      const src = 'import { qualityEval } from "../../shared/evaluators/quality.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow.js: allows imports from ../../clients/pokeapi.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-clients-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'clients' ), { recursive: true } );
      writeFileSync( join( dir, 'clients', 'pokeapi.js' ), 'export const getPokemon = () => {};\n' );
      const src = 'import { getPokemon } from "../../clients/pokeapi.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'steps.ts: allows imports from ../../shared/utils/keys.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'steps-shared-utils-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'utils' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'utils', 'keys.js' ), 'export const KEY = "test";\n' );
      const src = 'import { KEY } from "../../shared/utils/keys.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'steps.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'steps.ts: allows imports from ../../clients/redis.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'steps-clients-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'clients' ), { recursive: true } );
      writeFileSync( join( dir, 'clients', 'redis.js' ), 'export const client = {};\n' );
      const src = 'import { client } from "../../clients/redis.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'steps.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluators.ts: allows imports from ../../shared/utils/helpers.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'evals-shared-utils-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'utils' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'utils', 'helpers.js' ), 'export const helper = () => 1;\n' );
      const src = 'import { helper } from "../../shared/utils/helpers.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'evaluators.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );
  } );

  describe( 'cross-component imports - now allowed (no import restrictions)', () => {
    it( 'steps.ts: allows imports from ../../shared/steps/common.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'steps-shared-steps-allow-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'steps', 'common.js' ), 'export const commonStep = step({ name: "common" });\n' );
      const src = 'import { commonStep } from "../../shared/steps/common.js";';
      const result = await runLoader( join( dir, 'workflows', 'my_workflow', 'steps.js' ), src );
      expect( result.warnings ).toHaveLength( 0 );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'steps.ts: allows imports from ../../shared/evaluators/quality.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'steps-shared-evals-allow-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'evaluators', 'quality.js' ), 'export const qualityEval = evaluator({ name: "quality" });\n' );
      const src = 'import { qualityEval } from "../../shared/evaluators/quality.js";';
      const result = await runLoader( join( dir, 'workflows', 'my_workflow', 'steps.js' ), src );
      expect( result.warnings ).toHaveLength( 0 );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluators.ts: allows imports from ../../shared/steps/common.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'evals-shared-steps-allow-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'steps', 'common.js' ), 'export const commonStep = step({ name: "common" });\n' );
      const src = 'import { commonStep } from "../../shared/steps/common.js";';
      const result = await runLoader( join( dir, 'workflows', 'my_workflow', 'evaluators.js' ), src );
      expect( result.warnings ).toHaveLength( 0 );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluators.ts: allows imports from ../../shared/evaluators/other.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'evals-shared-evals-allow-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'evaluators', 'other.js' ), 'export const otherEval = evaluator({ name: "other" });\n' );
      const src = 'import { otherEval } from "../../shared/evaluators/other.js";';
      const result = await runLoader( join( dir, 'workflows', 'my_workflow', 'evaluators.js' ), src );
      expect( result.warnings ).toHaveLength( 0 );
      rmSync( dir, { recursive: true, force: true } );
    } );
  } );

  describe( 'workflow import scope', () => {
    it( 'workflow.js: allows imports from other workflow directories (cross-workflow)', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-cross-allow-' ) );
      mkdirSync( join( dir, 'workflows', 'workflow_a' ), { recursive: true } );
      mkdirSync( join( dir, 'workflows', 'workflow_b' ), { recursive: true } );
      writeFileSync( join( dir, 'workflows', 'workflow_b', 'steps.js' ), 'export const S = step({ name: "s" });\n' );
      // Cross-workflow imports are allowed for workflows (they can import steps from other workflows)
      const src = 'import { S } from "../workflow_b/steps.js";';
      await expect( runLoader( join( dir, 'workflows', 'workflow_a', 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow.js: allows imports from utils with relative parent paths', async () => {
      // The validator does not enforce strict scope boundaries, it validates by file type patterns
      const dir = mkdtempSync( join( tmpdir(), 'wf-parent-utils-' ) );
      mkdirSync( join( dir, 'src', 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'utils' ), { recursive: true } );
      writeFileSync( join( dir, 'utils', 'helpers.js' ), 'export const helper = () => 1;\n' );
      const src = 'import { helper } from "../../../utils/helpers.js";';
      // This should pass because it's not a component file
      await expect( runLoader( join( dir, 'src', 'workflows', 'my_workflow', 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );
  } );

  // =====================================================
  // Arbitrary path imports (proving any folder name works)
  // =====================================================

  describe( 'arbitrary path imports', () => {
    it( 'workflow.js: allows imports from ./foobar.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-arbitrary-1-' ) );
      const src = 'import { foo } from "./foobar.js";';
      await expect( runLoader( join( dir, 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow.js: allows imports from ./foobar/baz.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-arbitrary-2-' ) );
      mkdirSync( join( dir, 'foobar' ) );
      writeFileSync( join( dir, 'foobar', 'baz.js' ), 'export const baz = 1;\n' );
      const src = 'import { baz } from "./foobar/baz.js";';
      await expect( runLoader( join( dir, 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow.js: allows imports from ../../shared/foobar.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-arbitrary-3-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'foobar.js' ), 'export const foobar = 1;\n' );
      const src = 'import { foobar } from "../../shared/foobar.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow.js: allows imports from ../../shared/foobar/baz.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-arbitrary-4-' ) );
      mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
      mkdirSync( join( dir, 'shared', 'foobar' ), { recursive: true } );
      writeFileSync( join( dir, 'shared', 'foobar', 'baz.js' ), 'export const baz = 1;\n' );
      const src = 'import { baz } from "../../shared/foobar/baz.js";';
      await expect( runLoader( join( dir, 'workflows', 'my_workflow', 'workflow.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'steps.js: allows imports from ./helpers/anything.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'steps-arbitrary-1-' ) );
      mkdirSync( join( dir, 'helpers' ) );
      writeFileSync( join( dir, 'helpers', 'anything.js' ), 'export const anything = 1;\n' );
      const src = 'import { anything } from "./helpers/anything.js";';
      await expect( runLoader( join( dir, 'steps.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluators.js: allows imports from ./my_custom_lib/tools.js', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'evals-arbitrary-1-' ) );
      mkdirSync( join( dir, 'my_custom_lib' ) );
      writeFileSync( join( dir, 'my_custom_lib', 'tools.js' ), 'export const tools = {};\n' );
      const src = 'import { tools } from "./my_custom_lib/tools.js";';
      await expect( runLoader( join( dir, 'evaluators.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );
  } );

  // =====================================================
  // Instantiation location validation
  // =====================================================

  describe( 'instantiation location tests - correct locations', () => {
    it( 'step() called in steps/fetch_data.js is allowed', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'step-folder-allowed-' ) );
      mkdirSync( join( dir, 'steps' ) );
      const src = [
        'import { step } from "@outputai/core";',
        'export const fetchData = step({ name: "fetch_data", fn: async () => ({}) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'steps', 'fetch_data.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'step() called in src/shared/steps/common.js is allowed', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'step-shared-allowed-' ) );
      mkdirSync( join( dir, 'src', 'shared', 'steps' ), { recursive: true } );
      const src = [
        'import { step } from "@outputai/core";',
        'export const commonStep = step({ name: "common_step", fn: async () => ({}) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'src', 'shared', 'steps', 'common.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluator() called in evaluators/quality.js is allowed', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'eval-folder-allowed-' ) );
      mkdirSync( join( dir, 'evaluators' ) );
      const src = [
        'import { evaluator } from "@outputai/core";',
        'export const quality = evaluator({ name: "quality", fn: async () => ({ value: 1 }) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'evaluators', 'quality.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluator() called in src/shared/evaluators/metrics.js is allowed', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'eval-shared-allowed-' ) );
      mkdirSync( join( dir, 'src', 'shared', 'evaluators' ), { recursive: true } );
      const src = [
        'import { evaluator } from "@outputai/core";',
        'export const metrics = evaluator({ name: "metrics", fn: async () => ({ value: 1 }) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'src', 'shared', 'evaluators', 'metrics.js' ), src ) ).resolves.toBeTruthy();
      rmSync( dir, { recursive: true, force: true } );
    } );
  } );

  describe( 'instantiation location tests - wrong locations', () => {
    it( 'step() called in utils.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'step-utils-fail-' ) );
      const src = [
        'import { step } from "@outputai/core";',
        'export const badStep = step({ name: "bad", fn: async () => ({}) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'utils.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*step\(\).*steps/ );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'step() called in clients/api.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'step-clients-fail-' ) );
      mkdirSync( join( dir, 'clients' ) );
      const src = [
        'import { step } from "@outputai/core";',
        'export const badStep = step({ name: "bad", fn: async () => ({}) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'clients', 'api.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*step\(\).*steps/ );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluator() called in utils.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'eval-utils-fail-' ) );
      const src = [
        'import { evaluator } from "@outputai/core";',
        'export const badEval = evaluator({ name: "bad", fn: async () => ({ value: 1 }) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'utils.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*evaluator\(\).*evaluators/ );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluator() called in clients/api.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'eval-clients-fail-' ) );
      mkdirSync( join( dir, 'clients' ) );
      const src = [
        'import { evaluator } from "@outputai/core";',
        'export const badEval = evaluator({ name: "bad", fn: async () => ({ value: 1 }) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'clients', 'api.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*evaluator\(\).*evaluators/ );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluator() called in helpers.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'eval-helpers-fail-' ) );
      const src = [
        'import { evaluator } from "@outputai/core";',
        'export const badEval = evaluator({ name: "bad", fn: async () => ({ value: 1 }) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'helpers.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*evaluator\(\).*evaluators/ );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'step() called in evaluators.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'step-evals-fail-' ) );
      const src = [
        'import { step } from "@outputai/core";',
        'export const badStep = step({ name: "bad", fn: async () => ({}) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'evaluators.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*step\(\).*steps/ );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'evaluator() called in steps.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'eval-steps-fail-' ) );
      const src = [
        'import { evaluator } from "@outputai/core";',
        'export const badEval = evaluator({ name: "bad", fn: async () => ({ value: 1 }) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'steps.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*evaluator\(\).*evaluators/ );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow() called in shared/common.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-shared-fail-' ) );
      mkdirSync( join( dir, 'shared' ) );
      const src = [
        'import { workflow } from "@outputai/core";',
        'export const badWf = workflow({ name: "bad", fn: async () => ({}) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'shared', 'common.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*workflow\(\).*workflow/ );
      rmSync( dir, { recursive: true, force: true } );
    } );

    it( 'workflow() called in utils/index.js is blocked by validator', async () => {
      const dir = mkdtempSync( join( tmpdir(), 'wf-utils-fail-' ) );
      mkdirSync( join( dir, 'utils' ) );
      const src = [
        'import { workflow } from "@outputai/core";',
        'export const badWf = workflow({ name: "bad", fn: async () => ({}) });'
      ].join( '\n' );
      await expect( runLoader( join( dir, 'utils', 'index.js' ), src ) )
        .rejects.toThrow( /Invalid instantiation location.*workflow\(\).*workflow/ );
      rmSync( dir, { recursive: true, force: true } );
    } );
  } );
} );
