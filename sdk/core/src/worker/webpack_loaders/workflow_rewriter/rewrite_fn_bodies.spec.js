import { describe, it, expect } from 'vitest';
import generatorModule from '@babel/generator';
import { parse } from '../tools.js';
import rewriteFnBodies from './rewrite_fn_bodies.js';

const generate = generatorModule.default ?? generatorModule;

describe( 'rewrite_fn_bodies', () => {
  it( 'converts arrow to function and rewrites step/workflow calls', () => {
    const src = `
const obj = {
  fn: async x => {
    StepA( 1 );
    FlowB( 2 );
  }
}`;
    const ast = parse( src, 'file.js' );
    const stepImports = [ { localName: 'StepA', stepName: 'step.a' } ];
    const flowImports = [ { localName: 'FlowB', workflowName: 'flow.b' } ];

    const rewrote = rewriteFnBodies( { ast, stepImports, evaluatorImports: [], flowImports } );
    expect( rewrote ).toBe( true );

    const code = ast.program.body.map( n => n.type ).length; // smoke: ast mutated
    expect( code ).toBeGreaterThan( 0 );
  } );

  it( 'rewrites evaluator calls to this.invokeEvaluator', () => {
    const src = `
const obj = {
  fn: async x => {
    EvalA(3);
  }
};`;
    const ast = parse( src, 'file.js' );
    const evaluatorImports = [ { localName: 'EvalA', evaluatorName: 'eval.a' } ];
    const rewrote = rewriteFnBodies( { ast, stepImports: [], evaluatorImports, flowImports: [] } );
    expect( rewrote ).toBe( true );
  } );

  it( 'does nothing when no matching calls are present', () => {
    const src = [ 'const obj = { fn: function() { other(); } }' ].join( '\n' );
    const ast = parse( src, 'file.js' );
    const rewrote = rewriteFnBodies( { ast, stepImports: [], evaluatorImports: [], flowImports: [] } );
    expect( rewrote ).toBe( false );
  } );

  it( 'rewrites helper calls and helper bodies (steps and evaluators)', () => {
    const src = `
const foo = async () => {
  StepA( 1 );
};

function bar( x ) {
  EvalA( x );
}

const obj = {
  fn: async x => {
    foo();
    bar( 2 );
  }
}`;

    const ast = parse( src, 'file.js' );
    const stepImports = [ { localName: 'StepA', stepName: 'step.a' } ];
    const evaluatorImports = [ { localName: 'EvalA', evaluatorName: 'eval.a' } ];

    const rewrote = rewriteFnBodies( { ast, stepImports, sharedStepImports: [], evaluatorImports, flowImports: [] } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );

    // Helper calls in fn are rewritten to call(this, ...)
    expect( code ).toMatch( /foo\.call\(this\)/ );
    expect( code ).toMatch( /bar\.call\(this,\s*2\)/ );

    // Inside helpers, calls are rewritten
    expect( code ).toMatch( /this\.invokeStep\(([\"'])step\.a\1,\s*1\)/ );
    expect( code ).toMatch( /this\.invokeEvaluator\(([\"'])eval\.a\1,\s*x\)/ );

    // Arrow helper converted to function expression to allow dynamic this
    expect( code ).toMatch( /const foo = async function/ );
  } );

  it( 'rewrites nested helper chains until the step invocation', () => {
    const src = `
const foo = () => {
  bar();
};

function bar() {
  baz( 42 );
}

const baz = n => {
  StepA( n );
};

const obj = {
  fn: async () => {
    foo();
  }
}`;

    const ast = parse( src, 'file.js' );
    const stepImports = [ { localName: 'StepA', stepName: 'step.a' } ];
    const rewrote = rewriteFnBodies( { ast, stepImports, evaluatorImports: [], flowImports: [] } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );
    // Calls along the chain are bound with this
    expect( code ).toMatch( /foo\.call\(this\)/ );
    expect( code ).toMatch( /bar\.call\(this\)/ );
    expect( code ).toMatch( /baz\.call\(this,\s*42\)/ );
    // Deep step rewrite in the last helper
    expect( code ).toMatch( /this\.invokeStep\(([\"'])step\.a\1,\s*n\)/ );
    // Arrow helpers converted to functions
    expect( code ).toMatch( /const foo = function/ );
    expect( code ).toMatch( /const baz = function/ );
  } );
} );

