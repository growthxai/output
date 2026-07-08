import { describe, it, expect } from 'vitest';
import generatorModule from '@babel/generator';
import { parse } from '../tools.js';
import rewriteFnBodies from './rewrite_fn_bodies.js';

const generate = generatorModule.default ?? generatorModule;

describe( 'rewrite_fn_bodies', () => {
  it( 'rewrites step calls inside functions without changing function shape', () => {
    const src = `
const obj = {
  fn: async x => {
    StepA( 1 );
    FlowB( 2 );
  }
}`;
    const ast = parse( src, 'file.js' );
    const activityImports = [ { localName: 'StepA', activityName: 'step.a' } ];

    const rewrote = rewriteFnBodies( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );
    expect( code ).toMatch( /import \{ __invokeActivity as _invokeActivity \} from "@outputai\/core\/invoker";/ );
    expect( code ).toMatch( /fn:\s*async x =>/ );
    expect( code ).toMatch( /_invokeActivity\(([\"'])step\.a\1,\s*1\)/ );
    expect( code ).toMatch( /FlowB\(2\)/ );
  } );

  it( 'rewrites evaluator calls to __invokeActivity', () => {
    const src = `
const obj = {
  fn: async x => {
    EvalA(3);
  }
};`;
    const ast = parse( src, 'file.js' );
    const activityImports = [ { localName: 'EvalA', activityName: 'eval.a' } ];
    const rewrote = rewriteFnBodies( { ast, activityImports } );
    expect( rewrote ).toBe( true );
    const { code } = generate( ast, { quotes: 'single' } );
    expect( code ).toMatch( /_invokeActivity\(([\"'])eval\.a\1,\s*3\)/ );
  } );

  it( 'does nothing when no matching calls are present', () => {
    const src = [ 'const obj = { fn: function() { other(); } }' ].join( '\n' );
    const ast = parse( src, 'file.js' );
    const rewrote = rewriteFnBodies( { ast, activityImports: [] } );
    expect( rewrote ).toBe( false );
  } );

  it( 'rewrites imported activity calls in any function body', () => {
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
    const activityImports = [
      { localName: 'StepA', activityName: 'step.a' },
      { localName: 'EvalA', activityName: 'eval.a' }
    ];

    const rewrote = rewriteFnBodies( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );

    expect( code ).toMatch( /_invokeActivity\(([\"'])step\.a\1,\s*1\)/ );
    expect( code ).toMatch( /_invokeActivity\(([\"'])eval\.a\1,\s*x\)/ );
    expect( code ).toMatch( /foo\(\)/ );
    expect( code ).toMatch( /bar\(2\)/ );
    expect( code ).toMatch( /const foo = async \(\) =>/ );
  } );

  it( 'does not rewrite top-level calls', () => {
    const src = `
StepA( 1 );
function helper() {
  StepA( 2 );
}`;

    const ast = parse( src, 'file.js' );
    const activityImports = [ { localName: 'StepA', activityName: 'step.a' } ];
    const rewrote = rewriteFnBodies( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );
    expect( code ).toMatch( /StepA\(1\)/ );
    expect( code ).toMatch( /_invokeActivity\(([\"'])step\.a\1,\s*2\)/ );
  } );

  it( 'uses an existing __invokeActivity import when present', () => {
    const src = `
import { __invokeActivity as invoke } from '@outputai/core/invoker';
function helper() {
  StepA();
}`;
    const ast = parse( src, 'file.js' );
    const activityImports = [ { localName: 'StepA', activityName: 'step.a' } ];
    const rewrote = rewriteFnBodies( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );
    expect( code.match( /__invokeActivity/g ) ).toHaveLength( 1 );
    expect( code ).toMatch( /invoke\(([\"'])step\.a\1\)/ );
  } );
} );

