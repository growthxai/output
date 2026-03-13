import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import * as t from '@babel/types';
import {
  toAbsolutePath,
  parse,
  extractTopLevelStringConsts,
  getObjectKeyName,
  getLocalNameFromDestructuredProperty,
  toFunctionExpression,
  isStepsPath,
  isSharedStepsPath,
  isAnyStepsPath,
  isEvaluatorsPath,
  isSharedEvaluatorsPath,
  isWorkflowPath,
  createThisMethodCall,
  resolveNameFromArg,
  resolveNameFromOptions,
  buildStepsNameMap,
  buildSharedStepsNameMap,
  buildWorkflowNameMap,
  buildEvaluatorsNameMap,
  getFileKind
} from './tools.js';

describe( 'workflow_rewriter tools', () => {
  it( 'parse: parses JS with JSX plugin enabled', () => {
    const ast = parse( 'const A = 1; const C = () => <div />', 'file.js' );
    expect( ast?.type ).toBe( 'File' );
    expect( ast.program.body.length ).toBeGreaterThan( 0 );
  } );

  it( 'toAbsolutePath: resolves relative path against base directory', () => {
    expect( toAbsolutePath( '/base/dir', './file.js' ) ).toBe( resolvePath( '/base/dir', './file.js' ) );
  } );

  it( 'extractTopLevelStringConsts: returns only const string bindings', () => {
    const ast = parse( [
      'const A = \"a\"; let B = \"b\"; const C = 3;',
      'const D = `d`; const E = \"e\"'
    ].join( '\n' ), 'file.js' );
    const map = extractTopLevelStringConsts( ast );
    expect( map.get( 'A' ) ).toBe( 'a' );
    expect( map.has( 'B' ) ).toBe( false );
    expect( map.has( 'C' ) ).toBe( false );
    // Template literal is not a StringLiteral
    expect( map.has( 'D' ) ).toBe( false );
    expect( map.get( 'E' ) ).toBe( 'e' );
  } );

  it( 'resolveNameFromOptions: returns literal name from options object', () => {
    const opts = t.objectExpression( [ t.objectProperty( t.identifier( 'name' ), t.stringLiteral( 'literal.name' ) ) ] );
    const out = resolveNameFromOptions( opts, new Map(), 'X' );
    expect( out ).toBe( 'literal.name' );
  } );

  it( 'getObjectKeyName: resolves from Identifier and StringLiteral', () => {
    expect( getObjectKeyName( t.identifier( 'name' ) ) ).toBe( 'name' );
    expect( getObjectKeyName( t.stringLiteral( 'x' ) ) ).toBe( 'x' );
    expect( getObjectKeyName( t.numericLiteral( 1 ) ) ).toBeNull();
  } );

  it( 'buildStepsNameMap: reads names from steps module and caches result', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-steps-' ) );
    const stepsPath = join( dir, 'steps.js' );
    writeFileSync( stepsPath, [
      'export const StepA = step({ name: "step.a" })',
      'export const StepB = step({ name: "step.b" })'
    ].join( '\n' ) );
    const cache = new Map();
    const map1 = buildStepsNameMap( stepsPath, cache );
    expect( map1.get( 'StepA' ) ).toBe( 'step.a' );
    expect( map1.get( 'StepB' ) ).toBe( 'step.b' );
    expect( cache.get( stepsPath ) ).toBe( map1 );
    const map2 = buildStepsNameMap( stepsPath, cache );
    expect( map2 ).toBe( map1 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'buildEvaluatorsNameMap: reads names from evaluators module and caches result', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-evals-' ) );
    const evalsPath = join( dir, 'evaluators.js' );
    writeFileSync( evalsPath, [
      'export const EvalA = evaluator({ name: "eval.a" })',
      'export const EvalB = evaluator({ name: "eval.b" })'
    ].join( '\n' ) );
    const cache = new Map();
    const map1 = buildEvaluatorsNameMap( evalsPath, cache );
    expect( map1.get( 'EvalA' ) ).toBe( 'eval.a' );
    expect( map1.get( 'EvalB' ) ).toBe( 'eval.b' );
    expect( cache.get( evalsPath ) ).toBe( map1 );
    const map2 = buildEvaluatorsNameMap( evalsPath, cache );
    expect( map2 ).toBe( map1 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'getLocalNameFromDestructuredProperty: handles { a }, { a: b }, { a: b = 1 }', () => {
    // { a }
    const p1 = t.objectProperty( t.identifier( 'a' ), t.identifier( 'a' ), false, true );
    expect( getLocalNameFromDestructuredProperty( p1 ) ).toBe( 'a' );
    // { a: b }
    const p2 = t.objectProperty( t.identifier( 'a' ), t.identifier( 'b' ) );
    expect( getLocalNameFromDestructuredProperty( p2 ) ).toBe( 'b' );
    // { a: b = 1 }
    const p3 = t.objectProperty( t.identifier( 'a' ), t.assignmentPattern( t.identifier( 'b' ), t.numericLiteral( 1 ) ) );
    expect( getLocalNameFromDestructuredProperty( p3 ) ).toBe( 'b' );
    // Unsupported shape
    const p4 = t.objectProperty( t.identifier( 'a' ), t.arrayExpression( [] ) );
    expect( getLocalNameFromDestructuredProperty( p4 ) ).toBeNull();
  } );

  it( 'buildWorkflowNameMap: reads named and default workflow names and caches', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-output-' ) );
    const wfPath = join( dir, 'workflow.js' );
    writeFileSync( wfPath, [
      'export const FlowA = workflow({ name: "flow.a" })',
      'export default workflow({ name: "flow.def" })'
    ].join( '\n' ) );
    const cache = new Map();
    const res1 = buildWorkflowNameMap( wfPath, cache );
    expect( res1.named.get( 'FlowA' ) ).toBe( 'flow.a' );
    expect( res1.default ).toBe( 'flow.def' );
    expect( cache.get( wfPath ) ).toBe( res1 );
    const res2 = buildWorkflowNameMap( wfPath, cache );
    expect( res2 ).toBe( res1 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'toFunctionExpression: converts arrow, wraps expression bodies', () => {
    const arrowExprBody = t.arrowFunctionExpression( [ t.identifier( 'x' ) ], t.identifier( 'x' ) );
    const arrowBlockBody = t.arrowFunctionExpression( [], t.blockStatement( [ t.returnStatement( t.numericLiteral( 1 ) ) ] ) );
    const fn1 = toFunctionExpression( arrowExprBody );
    const fn2 = toFunctionExpression( arrowBlockBody );
    expect( t.isFunctionExpression( fn1 ) ).toBe( true );
    expect( t.isBlockStatement( fn1.body ) ).toBe( true );
    expect( t.isReturnStatement( fn1.body.body[0] ) ).toBe( true );
    expect( t.isFunctionExpression( fn2 ) ).toBe( true );
  } );

  it( 'isStepsPath: matches LOCAL steps.js (no path traversal)', () => {
    // Local steps (without ../ or /shared/)
    expect( isStepsPath( 'steps.js' ) ).toBe( true );
    expect( isStepsPath( './steps.js' ) ).toBe( true );
    expect( isStepsPath( '/a/b/steps.js' ) ).toBe( true );
    expect( isStepsPath( './steps/fetch.js' ) ).toBe( true );
    // Shared steps (with ../ or /shared/) should NOT match isStepsPath
    expect( isStepsPath( '../steps.js' ) ).toBe( false );
    expect( isStepsPath( '../../shared/steps/common.js' ) ).toBe( false );
    // Non-steps
    expect( isStepsPath( 'steps.ts' ) ).toBe( false );
    expect( isStepsPath( 'workflow.js' ) ).toBe( false );
  } );

  it( 'isSharedStepsPath: matches steps imported from outside workflow directory', () => {
    // Shared steps: must have steps pattern AND have path traversal or /shared/
    expect( isSharedStepsPath( '../steps.js' ) ).toBe( true );
    expect( isSharedStepsPath( '../../steps.js' ) ).toBe( true );
    expect( isSharedStepsPath( '../../shared/steps/common.js' ) ).toBe( true );
    expect( isSharedStepsPath( '../other_workflow/steps.js' ) ).toBe( true );
    expect( isSharedStepsPath( '/src/shared/steps/common.js' ) ).toBe( true );
    // Local steps (no traversal, no /shared/) should NOT match
    expect( isSharedStepsPath( './steps.js' ) ).toBe( false );
    expect( isSharedStepsPath( 'steps.js' ) ).toBe( false );
    expect( isSharedStepsPath( './steps/fetch.js' ) ).toBe( false );
    // Non-steps should NOT match
    expect( isSharedStepsPath( '../utils.js' ) ).toBe( false );
    expect( isSharedStepsPath( 'evaluators.js' ) ).toBe( false );
  } );

  it( 'isAnyStepsPath: matches any steps pattern (local or shared)', () => {
    // Local steps
    expect( isAnyStepsPath( 'steps.js' ) ).toBe( true );
    expect( isAnyStepsPath( './steps.js' ) ).toBe( true );
    expect( isAnyStepsPath( './steps/fetch.js' ) ).toBe( true );
    // Shared steps
    expect( isAnyStepsPath( '../steps.js' ) ).toBe( true );
    expect( isAnyStepsPath( '../../shared/steps/common.js' ) ).toBe( true );
    // Non-steps
    expect( isAnyStepsPath( 'workflow.js' ) ).toBe( false );
    expect( isAnyStepsPath( 'utils.js' ) ).toBe( false );
  } );

  it( 'isWorkflowPath: matches workflow.js at root or subpath', () => {
    expect( isWorkflowPath( 'workflow.js' ) ).toBe( true );
    expect( isWorkflowPath( './workflow.js' ) ).toBe( true );
    expect( isWorkflowPath( '/a/b/workflow.js' ) ).toBe( true );
    expect( isWorkflowPath( 'workflow.ts' ) ).toBe( false );
    expect( isWorkflowPath( 'steps.js' ) ).toBe( false );
  } );

  it( 'isEvaluatorsPath: matches local evaluators.js but excludes shared', () => {
    expect( isEvaluatorsPath( 'evaluators.js' ) ).toBe( true );
    expect( isEvaluatorsPath( './evaluators.js' ) ).toBe( true );
    expect( isEvaluatorsPath( '/a/b/evaluators.js' ) ).toBe( true );
    expect( isEvaluatorsPath( './evaluators/quality.js' ) ).toBe( true );
    // Shared evaluators should NOT match (path traversal or /shared/)
    expect( isEvaluatorsPath( '../evaluators.js' ) ).toBe( false );
    expect( isEvaluatorsPath( '../../shared/evaluators/common.js' ) ).toBe( false );
    expect( isEvaluatorsPath( 'evaluators.ts' ) ).toBe( false );
    expect( isEvaluatorsPath( 'steps.js' ) ).toBe( false );
  } );

  it( 'isSharedEvaluatorsPath: matches evaluators imported from outside workflow directory', () => {
    // Shared evaluators: must have evaluators pattern AND have path traversal or /shared/
    expect( isSharedEvaluatorsPath( '../evaluators.js' ) ).toBe( true );
    expect( isSharedEvaluatorsPath( '../../evaluators.js' ) ).toBe( true );
    expect( isSharedEvaluatorsPath( '../../shared/evaluators/quality.js' ) ).toBe( true );
    expect( isSharedEvaluatorsPath( '../other_workflow/evaluators.js' ) ).toBe( true );
    expect( isSharedEvaluatorsPath( '/src/shared/evaluators/quality.js' ) ).toBe( true );
    // Local evaluators (no traversal, no /shared/) should NOT match
    expect( isSharedEvaluatorsPath( './evaluators.js' ) ).toBe( false );
    expect( isSharedEvaluatorsPath( 'evaluators.js' ) ).toBe( false );
    expect( isSharedEvaluatorsPath( './evaluators/quality.js' ) ).toBe( false );
    // Non-evaluators should NOT match
    expect( isSharedEvaluatorsPath( '../utils.js' ) ).toBe( false );
    expect( isSharedEvaluatorsPath( 'steps.js' ) ).toBe( false );
  } );

  it( 'createThisMethodCall: builds this.method(\'name\', ...args) call', () => {
    const call = createThisMethodCall( 'invoke', 'n', [ t.numericLiteral( 1 ), t.identifier( 'x' ) ] );
    expect( t.isCallExpression( call ) ).toBe( true );
    expect( t.isMemberExpression( call.callee ) ).toBe( true );
    expect( t.isThisExpression( call.callee.object ) ).toBe( true );
    expect( t.isIdentifier( call.callee.property, { name: 'invoke' } ) ).toBe( true );
    expect( t.isStringLiteral( call.arguments[0], { value: 'n' } ) ).toBe( true );
    expect( call.arguments.length ).toBe( 3 );
  } );

  it( 'buildSharedStepsNameMap: reads names from shared steps module and caches result', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-shared-steps-' ) );
    mkdirSync( join( dir, 'shared', 'steps' ), { recursive: true } );
    const stepsPath = join( dir, 'shared', 'steps', 'common.js' );
    writeFileSync( stepsPath, [
      'export const StepA = step({ name: "shared.step.a" })',
      'export const StepB = step({ name: "shared.step.b" })'
    ].join( '\n' ) );
    const cache = new Map();
    const map1 = buildSharedStepsNameMap( stepsPath, cache );
    expect( map1.get( 'StepA' ) ).toBe( 'shared.step.a' );
    expect( map1.get( 'StepB' ) ).toBe( 'shared.step.b' );
    expect( cache.get( stepsPath ) ).toBe( map1 );
    const map2 = buildSharedStepsNameMap( stepsPath, cache );
    expect( map2 ).toBe( map1 );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'getFileKind: classifies file by its path', () => {
    expect( getFileKind( '/p/workflow.js' ) ).toBe( 'workflow' );
    expect( getFileKind( '/p/steps.js' ) ).toBe( 'steps' );
    // Files in steps folder are steps
    expect( getFileKind( '/p/steps/fetch.js' ) ).toBe( 'steps' );
    expect( getFileKind( '/p/shared/steps/common.js' ) ).toBe( 'steps' );
    expect( getFileKind( '/p/evaluators.js' ) ).toBe( 'evaluators' );
    expect( getFileKind( '/p/evaluators/quality.js' ) ).toBe( 'evaluators' );
    expect( getFileKind( '/p/other.js' ) ).toBe( null );
    expect( getFileKind( '/p/utils.js' ) ).toBe( null );
    expect( getFileKind( '/p/clients/api.js' ) ).toBe( null );
  } );

  it( 'resolveNameFromArg: resolves string literal directly', () => {
    expect( resolveNameFromArg( t.stringLiteral( 'my_name' ), new Map(), 'X' ) ).toBe( 'my_name' );
  } );

  it( 'resolveNameFromArg: resolves identifier from consts', () => {
    const consts = new Map( [ [ 'MY_NAME', 'resolved_name' ] ] );
    expect( resolveNameFromArg( t.identifier( 'MY_NAME' ), consts, 'X' ) ).toBe( 'resolved_name' );
  } );

  it( 'resolveNameFromArg: falls back to resolveNameFromOptions for objects', () => {
    const opts = t.objectExpression( [ t.objectProperty( t.identifier( 'name' ), t.stringLiteral( 'obj_name' ) ) ] );
    expect( resolveNameFromArg( opts, new Map(), 'X' ) ).toBe( 'obj_name' );
  } );

  it( 'buildEvaluatorsNameMap: reads names from string-arg factory pattern', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-verify-evals-' ) );
    const evalsPath = join( dir, 'evaluators.js' );
    writeFileSync( evalsPath, 'export const EvalA = verify( \'eval_a\', async () => {} )' );
    const cache = new Map();
    const map = buildEvaluatorsNameMap( evalsPath, cache );
    expect( map.get( 'EvalA' ) ).toBe( 'eval_a' );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'buildEvaluatorsNameMap: reads names from object-arg verify pattern', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-verify-obj-evals-' ) );
    const evalsPath = join( dir, 'evaluators.js' );
    writeFileSync( evalsPath, 'export const EvalA = verify( { name: \'eval_a\' }, async () => {} )' );
    const cache = new Map();
    const map = buildEvaluatorsNameMap( evalsPath, cache );
    expect( map.get( 'EvalA' ) ).toBe( 'eval_a' );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'buildEvaluatorsNameMap: reads names from mixed factory patterns', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-mixed-evals-' ) );
    const evalsPath = join( dir, 'evaluators.js' );
    writeFileSync( evalsPath, [
      'export const EvalA = verify( { name: \'eval_a\' }, async () => {} )',
      'export const EvalB = evaluator( { name: \'eval_b\' } )'
    ].join( '\n' ) );
    const cache = new Map();
    const map = buildEvaluatorsNameMap( evalsPath, cache );
    expect( map.get( 'EvalA' ) ).toBe( 'eval_a' );
    expect( map.get( 'EvalB' ) ).toBe( 'eval_b' );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'buildStepsNameMap: reads names from string-arg factory pattern', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-verify-steps-' ) );
    const stepsPath = join( dir, 'steps.js' );
    writeFileSync( stepsPath, 'export const StepA = myStepHelper( \'step_a\', async () => {} )' );
    const cache = new Map();
    const map = buildStepsNameMap( stepsPath, cache );
    expect( map.get( 'StepA' ) ).toBe( 'step_a' );
    rmSync( dir, { recursive: true, force: true } );
  } );

  it( 'buildWorkflowNameMap: reads names from string-arg factory pattern', () => {
    const dir = mkdtempSync( join( tmpdir(), 'tools-verify-workflow-' ) );
    const wfPath = join( dir, 'workflow.js' );
    writeFileSync( wfPath, 'export default myWorkflowHelper( { name: \'my_flow\' } )' );
    const cache = new Map();
    const res = buildWorkflowNameMap( wfPath, cache );
    expect( res.default ).toBe( 'my_flow' );
    rmSync( dir, { recursive: true, force: true } );
  } );
} );
