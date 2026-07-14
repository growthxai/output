import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../tools.js';
import collectTargetImports from './collect_target_imports.js';

const caches = () => ( {
  stepsNameCache: new Map(),
  evaluatorsNameCache: new Map(),
  sharedStepsNameCache: new Map(),
  sharedEvaluatorsNameCache: new Map()
} );

const makeAst = ( source, filename ) => parse( source, filename );

describe( 'collect_target_imports', () => {
  it( 'collects ESM activity imports and leaves workflow imports intact', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-esm-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepA = step({ name: \'step.a\' });' );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const EvalA = evaluator({ name: \'eval.a\' });' );
    writeFileSync( join( dir, 'workflow.js' ), 'export const FlowA = workflow({ name: \'flow.a\' });' );

    const ast = makeAst( `
import { StepA } from './steps.js';
import { EvalA } from './evaluators.js';
import { FlowA } from './workflow.js';`, join( dir, 'file.js' ) );

    const { activityImports } = collectTargetImports( ast, dir, caches() );

    expect( activityImports ).toEqual( [
      { localName: 'StepA', activityName: 'step.a' },
      { localName: 'EvalA', activityName: 'eval.a' }
    ] );
    expect( ast.program.body.find( n => n.type === 'ImportDeclaration' )?.source.value ).toBe( './workflow.js' );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'collects CJS activity requires and leaves workflow requires intact', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-cjs-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepB = step({ name: \'step.b\' });' );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const EvalB = evaluator({ name: \'eval.b\' });' );
    writeFileSync( join( dir, 'workflow.js' ), 'export const helper = () => 42;' );

    const ast = makeAst( `
const { StepB } = require('./steps.js');
const { EvalB } = require('./evaluators.js');
const { helper } = require('./workflow.js');`, join( dir, 'file.js' ) );

    const { activityImports } = collectTargetImports( ast, dir, caches() );

    expect( activityImports ).toEqual( [
      { localName: 'StepB', activityName: 'step.b' },
      { localName: 'EvalB', activityName: 'eval.b' }
    ] );
    expect( ast.program.body.some( n => n.type === 'VariableDeclaration' ) ).toBe( true );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'uses file path to choose component type instead of factory callee name', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-path-scoped-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepExport = evaluator({ name: \'from.steps\' });' );
    writeFileSync( join( dir, 'evaluators.js' ), 'export const EvalExport = step({ name: \'from.evaluators\' });' );

    const esmAst = makeAst( `
import { StepExport } from './steps.js';
import { EvalExport } from './evaluators.js';`, join( dir, 'esm.js' ) );
    const cjsAst = makeAst( `
const { StepExport } = require('./steps.js');
const { EvalExport } = require('./evaluators.js');`, join( dir, 'cjs.js' ) );

    expect( collectTargetImports( esmAst, dir, caches() ).activityImports ).toEqual( [
      { localName: 'StepExport', activityName: 'from.steps' },
      { localName: 'EvalExport', activityName: 'from.evaluators' }
    ] );
    expect( collectTargetImports( cjsAst, dir, caches() ).activityImports ).toEqual( [
      { localName: 'StepExport', activityName: 'from.steps' },
      { localName: 'EvalExport', activityName: 'from.evaluators' }
    ] );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'collects shared steps and evaluators from ESM and CJS imports', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-shared-' ) );
    mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
    mkdirSync( join( dir, 'shared', 'evaluators' ), { recursive: true } );
    mkdirSync( join( dir, 'workflows', 'my_workflow' ), { recursive: true } );
    writeFileSync( join( dir, 'shared', 'steps', 'common.js' ), 'export const SharedStep = step({ name: \'shared.step\' });' );
    writeFileSync(
      join( dir, 'shared', 'evaluators', 'common.js' ),
      'export const SharedEval = evaluator({ name: \'shared.eval\' });'
    );

    const fileDir = join( dir, 'workflows', 'my_workflow' );
    const esmAst = makeAst( `
import { SharedStep } from '../../shared/steps/common.js';
import { SharedEval } from '../../shared/evaluators/common.js';`, join( fileDir, 'workflow.js' ) );
    const cjsAst = makeAst( `
const { SharedStep } = require('../../shared/steps/common.js');
const { SharedEval } = require('../../shared/evaluators/common.js');`, join( fileDir, 'helper.js' ) );

    expect( collectTargetImports( esmAst, fileDir, caches() ).activityImports ).toEqual( [
      { localName: 'SharedStep', activityName: 'shared.step' },
      { localName: 'SharedEval', activityName: 'shared.eval' }
    ] );
    expect( collectTargetImports( cjsAst, fileDir, caches() ).activityImports ).toEqual( [
      { localName: 'SharedStep', activityName: 'shared.step' },
      { localName: 'SharedEval', activityName: 'shared.eval' }
    ] );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'leaves destructured workflow requires untouched', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-workflow-require-' ) );
    writeFileSync( join( dir, 'workflow.js' ), 'export const FlowX = workflow({ name: \'flow.x\' });' );

    const ast = makeAst( 'const { FlowX } = require(\'./workflow.js\');', join( dir, 'file.js' ) );
    const { activityImports } = collectTargetImports( ast, dir, caches() );

    expect( activityImports ).toEqual( [] );
    expect( ast.program.body.some( n => n.type === 'VariableDeclaration' ) ).toBe( true );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'throws when a named activity import cannot be resolved from the target file', () => {
    const dir = mkdtempSync( join( tmpdir(), 'collect-unresolved-' ) );
    writeFileSync( join( dir, 'steps.js' ), 'export const StepA = step({ name: \'step.a\' });' );

    const ast = makeAst( 'import { MissingStep } from \'./steps.js\';', join( dir, 'file.js' ) );

    expect( () => collectTargetImports( ast, dir, caches() ) ).toThrow( /Unresolved import 'MissingStep'/ );
    rmSync( dir, { recursive: true, force: true } );
  } );
} );
