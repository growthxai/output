import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../tools.js';
import collectTargetImports from './collect_target_imports.js';

function makeAst( source, filename ) {
  return parse( source, filename );
}

describe( 'collect_target_imports', () => {
  it( 'collects ESM imports for steps and evaluators and leaves workflow imports intact', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-esm-' ) );
    writeFileSync( join( dir, 'steps.js' ), `
export const StepA = step({ name: 'step.a' });
export const StepB = step({ name: 'step.b' });` );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const EvalA = evaluator({ name: \'eval.a\' });' );
    writeFileSync( join( dir, 'workflow.js' ), `
export const FlowA = workflow({ name: 'flow.a' });
export default workflow({ name: 'flow.def' });` );

    const source = `
import { StepA } from './steps.js';
import { EvalA } from './evaluators.js';
import WF, { FlowA } from './workflow.js';
const x = 1;`;

    const ast = makeAst( source, join( dir, 'file.js' ) );
    const { stepImports, evaluatorImports } = collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    );
    expect( evaluatorImports ).toEqual( [ { localName: 'EvalA', evaluatorName: 'eval.a' } ] );

    expect( stepImports ).toEqual( [ { localName: 'StepA', stepName: 'step.a' } ] );
    expect( ast.program.body.find( n => n.type === 'ImportDeclaration' )?.source.value ).toBe( './workflow.js' );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'collects CJS requires for steps and evaluators and leaves workflow requires intact', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepB = step({ name: \'step.b\' })' );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const EvalB = evaluator({ name: \'eval.b\' })' );
    writeFileSync( join( dir, 'workflow.js' ), 'export default workflow({ name: \'flow.c\' })' );

    const source = `
const { StepB } = require( './steps.js' );
const { EvalB } = require( './evaluators.js' );
const WF = require( './workflow.js' );
const obj = {};`;

    const ast = makeAst( source, join( dir, 'file.js' ) );
    const { stepImports, evaluatorImports } = collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    );
    expect( evaluatorImports ).toEqual( [ { localName: 'EvalB', evaluatorName: 'eval.b' } ] );

    expect( stepImports ).toEqual( [ { localName: 'StepB', stepName: 'step.b' } ] );
    // Only non-target require declarators should remain.
    const hasRequireDecl = ast.program.body.some( n =>
      n.type === 'VariableDeclaration' && n.declarations.some( d => d.init && d.init.type === 'CallExpression' )
    );
    expect( hasRequireDecl ).toBe( true );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves ESM import from evaluators.js regardless of callee name', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-esm-mismatch-eval-' ) );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const MyExport = step({ name: \'bad\' });' );

    const source = 'import { MyExport } from \'./evaluators.js\';';
    const ast = makeAst( source, join( dir, 'file.js' ) );

    const { evaluatorImports } = collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    );
    expect( evaluatorImports ).toEqual( [ { localName: 'MyExport', evaluatorName: 'bad' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves ESM import from steps.js regardless of callee name', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-esm-mismatch-step-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const MyExport = evaluator({ name: \'bad\' });' );

    const source = 'import { MyExport } from \'./steps.js\';';
    const ast = makeAst( source, join( dir, 'file.js' ) );

    const { stepImports } = collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    );
    expect( stepImports ).toEqual( [ { localName: 'MyExport', stepName: 'bad' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves CJS require from evaluators.js regardless of callee name', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-mismatch-eval-' ) );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const MyExport = step({ name: \'bad\' });' );

    const source = 'const { MyExport } = require( \'./evaluators.js\' );';
    const ast = makeAst( source, join( dir, 'file.js' ) );

    const { evaluatorImports } = collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    );
    expect( evaluatorImports ).toEqual( [ { localName: 'MyExport', evaluatorName: 'bad' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves CJS require from steps.js regardless of callee name', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-mismatch-step-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const MyExport = evaluator({ name: \'bad\' });' );

    const source = 'const { MyExport } = require( \'./steps.js\' );';
    const ast = makeAst( source, join( dir, 'file.js' ) );

    const { stepImports } = collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    );
    expect( stepImports ).toEqual( [ { localName: 'MyExport', stepName: 'bad' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'leaves ESM imports from workflow.js alone', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-esm-mismatch-wf-' ) );
    writeFileSync( join( dir, 'workflow.js' ), 'export const helper = () => 42;' );

    const source = 'import { helper } from \'./workflow.js\';';
    const ast = makeAst( source, join( dir, 'file.js' ) );

    expect( () => collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    ) ).not.toThrow();
    expect( ast.program.body.find( n => n.type === 'ImportDeclaration' )?.source.value ).toBe( './workflow.js' );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'leaves CJS requires from workflow.js alone', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-mismatch-wf-' ) );
    writeFileSync( join( dir, 'workflow.js' ), 'export const helper = () => 42;' );

    const source = 'const { helper } = require( \'./workflow.js\' );';
    const ast = makeAst( source, join( dir, 'file.js' ) );

    expect( () => collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    ) ).not.toThrow();
    expect( ast.program.body.some( n => n.type === 'VariableDeclaration' ) ).toBe( true );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'does not collect CJS destructured require from workflow.js', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-wf-destruct-' ) );
    writeFileSync( join( dir, 'workflow.js' ), 'export const FlowX = workflow({ name: \'flow.x\' });' );

    const source = 'const { FlowX } = require( \'./workflow.js\' );\nconst obj = {};';
    const ast = makeAst( source, join( dir, 'file.js' ) );

    collectTargetImports(
      ast,
      dir,
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map() }
    );
    expect( ast.program.body.some( n => n.type === 'VariableDeclaration' ) ).toBe( true );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'collects ESM shared evaluator imports', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-esm-shared-eval-' ) );
    mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync(
      join( dir, 'shared', 'evaluators', 'common.js' ),
      'export const SharedEval = evaluator({ name: \'shared.eval\' });'
    );

    const source = 'import { SharedEval } from \'../../shared/evaluators/common.js\';';
    const ast = makeAst( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    const { sharedEvaluatorImports } = collectTargetImports(
      ast,
      join( dir, 'workflows', 'my_workflow' ),
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map(), sharedEvaluatorsNameCache: new Map() }
    );
    expect( sharedEvaluatorImports ).toEqual( [ { localName: 'SharedEval', evaluatorName: 'shared.eval' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'collects CJS shared evaluator requires', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-shared-eval-' ) );
    mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync(
      join( dir, 'shared', 'evaluators', 'common.js' ),
      'export const SharedEval = evaluator({ name: \'shared.eval\' });'
    );

    const source = 'const { SharedEval } = require( \'../../shared/evaluators/common.js\' );';
    const ast = makeAst( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    const { sharedEvaluatorImports } = collectTargetImports(
      ast,
      join( dir, 'workflows', 'my_workflow' ),
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map(), sharedEvaluatorsNameCache: new Map() }
    );
    expect( sharedEvaluatorImports ).toEqual( [ { localName: 'SharedEval', evaluatorName: 'shared.eval' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'collects CJS shared steps requires', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-shared-step-' ) );
    mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync(
      join( dir, 'shared', 'steps', 'common.js' ),
      'export const SharedA = step({ name: \'shared.a\' });'
    );

    const source = 'const { SharedA } = require( \'../../shared/steps/common.js\' );';
    const ast = makeAst( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    const { sharedStepImports } = collectTargetImports(
      ast,
      join( dir, 'workflows', 'my_workflow' ),
      {
        stepsNameCache: new Map(), sharedStepsNameCache: new Map(),
        evaluatorsNameCache: new Map(), sharedEvaluatorsNameCache: new Map()
      }
    );
    expect( sharedStepImports ).toEqual( [ { localName: 'SharedA', stepName: 'shared.a' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves CJS shared steps require regardless of callee name', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-shared-step-mismatch-' ) );
    mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync(
      join( dir, 'shared', 'steps', 'common.js' ),
      'export const MyExport = evaluator({ name: \'bad\' });'
    );

    const source = 'const { MyExport } = require( \'../../shared/steps/common.js\' );';
    const ast = makeAst( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    const { sharedStepImports } = collectTargetImports(
      ast,
      join( dir, 'workflows', 'my_workflow' ),
      {
        stepsNameCache: new Map(), sharedStepsNameCache: new Map(),
        evaluatorsNameCache: new Map(), sharedEvaluatorsNameCache: new Map()
      }
    );
    expect( sharedStepImports ).toEqual( [ { localName: 'MyExport', stepName: 'bad' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves CJS shared evaluator require regardless of callee name', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-shared-eval-mismatch-' ) );
    mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync(
      join( dir, 'shared', 'evaluators', 'common.js' ),
      'export const MyExport = step({ name: \'bad\' });'
    );

    const source = 'const { MyExport } = require( \'../../shared/evaluators/common.js\' );';
    const ast = makeAst( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    const { sharedEvaluatorImports } = collectTargetImports(
      ast,
      join( dir, 'workflows', 'my_workflow' ),
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map(), sharedEvaluatorsNameCache: new Map() }
    );
    expect( sharedEvaluatorImports ).toEqual( [ { localName: 'MyExport', evaluatorName: 'bad' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'resolves ESM shared evaluator import regardless of callee name', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-esm-shared-eval-mismatch-' ) );
    mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync(
      join( dir, 'shared', 'evaluators', 'common.js' ),
      'export const MyExport = step({ name: \'bad\' });'
    );

    const source = 'import { MyExport } from \'../../shared/evaluators/common.js\';';
    const ast = makeAst( source, join( dir, 'workflows', 'my_workflow', 'workflow.js' ) );

    const { sharedEvaluatorImports } = collectTargetImports(
      ast,
      join( dir, 'workflows', 'my_workflow' ),
      { stepsNameCache: new Map(), evaluatorsNameCache: new Map(), sharedEvaluatorsNameCache: new Map() }
    );
    expect( sharedEvaluatorImports ).toEqual( [ { localName: 'MyExport', evaluatorName: 'bad' } ] );

    rmSync( dir, { recursive: true, force: true } );
  } );

} );

