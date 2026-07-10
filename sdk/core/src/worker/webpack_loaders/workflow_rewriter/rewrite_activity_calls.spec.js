import { describe, it, expect, vi } from 'vitest';
import generatorModule from '@babel/generator';
import { parse } from '../tools.js';
import rewriteActivityCalls from './rewrite_activity_calls.js';

const { invokeActivitySymbolKey } = vi.hoisted( () => ( {
  invokeActivitySymbolKey: 'test:invoke_activity'
} ) );

vi.mock( '#consts', async importOriginal => ( {
  ...await importOriginal(),
  INVOKE_ACTIVITY_SYMBOL: Symbol.for( invokeActivitySymbolKey )
} ) );

const generate = generatorModule.default ?? generatorModule;
const escapeRegExp = value => value.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
const invokeActivityPattern = activityName =>
  new RegExp( `globalThis\\[globalThis\\.Symbol\\.for\\(([\"'])${escapeRegExp( invokeActivitySymbolKey )}\\1\\)\\]\\(([\"'])${activityName}\\2` );

describe( 'rewrite_activity_calls', () => {
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

    const rewrote = rewriteActivityCalls( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );
    expect( code ).not.toMatch( /@outputai\/core\/invoker/ );
    expect( code ).toMatch( /fn:\s*async x =>/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.a' ) );
    expect( code ).toMatch( /,\s*1\)/ );
    expect( code ).toMatch( /FlowB\(2\)/ );
  } );

  it( 'rewrites evaluator calls to the global activity dispatcher', () => {
    const src = `
const obj = {
  fn: async x => {
    EvalA(3);
  }
};`;
    const ast = parse( src, 'file.js' );
    const activityImports = [ { localName: 'EvalA', activityName: 'eval.a' } ];
    const rewrote = rewriteActivityCalls( { ast, activityImports } );
    expect( rewrote ).toBe( true );
    const { code } = generate( ast, { quotes: 'single' } );
    expect( code ).toMatch( invokeActivityPattern( 'eval\\.a' ) );
    expect( code ).toMatch( /,\s*3\)/ );
  } );

  it( 'does nothing when no matching calls are present', () => {
    const src = [ 'const obj = { fn: function() { other(); } }' ].join( '\n' );
    const ast = parse( src, 'file.js' );
    const rewrote = rewriteActivityCalls( { ast, activityImports: [] } );
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

    const rewrote = rewriteActivityCalls( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );

    expect( code ).toMatch( invokeActivityPattern( 'step\\.a' ) );
    expect( code ).toMatch( invokeActivityPattern( 'eval\\.a' ) );
    expect( code ).toMatch( /,\s*1\)/ );
    expect( code ).toMatch( /,\s*x\)/ );
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
    const rewrote = rewriteActivityCalls( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );
    expect( code ).toMatch( /StepA\(1\)/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.a' ) );
    expect( code ).toMatch( /,\s*2\)/ );
  } );

  it( 'ignores local invoke activity names because globalThis is explicit', () => {
    const src = `
const __invokeActivity = () => 'local';
const _invokeActivity = () => 'local';
function helper() {
  StepA();
}`;
    const ast = parse( src, 'file.js' );
    const activityImports = [ { localName: 'StepA', activityName: 'step.a' } ];
    const rewrote = rewriteActivityCalls( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );
    expect( code ).not.toMatch( /@outputai\/core\/invoker/ );
    expect( code ).toMatch( /const __invokeActivity = \(\) => 'local'/ );
    expect( code ).toMatch( /const _invokeActivity = \(\) => 'local'/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.a' ) );
  } );

  it( 'reads Symbol through globalThis so local Symbol bindings are safe', () => {
    const src = `
function helper( Symbol ) {
  StepA();
}`;
    const ast = parse( src, 'file.js' );
    const activityImports = [ { localName: 'StepA', activityName: 'step.a' } ];
    const rewrote = rewriteActivityCalls( { ast, activityImports } );
    expect( rewrote ).toBe( true );

    const { code } = generate( ast, { quotes: 'single' } );
    expect( code ).toMatch( /function helper\(Symbol\)/ );
    expect( code ).toMatch( invokeActivityPattern( 'step\\.a' ) );
  } );

  it( 'throws when globalThis is shadowed at an activity call site', () => {
    const src = `
function helper( globalThis ) {
  StepA();
}`;
    const ast = parse( src, 'file.js' );
    const activityImports = [ { localName: 'StepA', activityName: 'step.a' } ];

    expect( () => rewriteActivityCalls( { ast, activityImports } ) ).toThrow( /globalThis.*shadowed/ );
  } );
} );
