import { afterEach, describe, expect, it } from 'vitest';
import { resolveInvocationDir } from './path.js';

const OriginalError = Error;

const mockStack = stack => {
  Error = class extends OriginalError {
    constructor( ...args ) {
      super( ...args );
      this.stack = stack;
    }
  };
};

describe( 'resolveInvocationDir', () => {
  afterEach( () => {
    Error = OriginalError;
  } );

  it( 'skips core llm frames and returns the step dir in the monorepo', () => {
    mockStack( `Error
    at resolveInvocationDir (file:///app/sdk/core/src/helpers/path.js:27:17)
    at loadPrompt (file:///app/sdk/core/src/llm/prompt/loader.js:38:64)
    at generateText (file:///app/sdk/core/src/llm/generate.js:51:18)
    at fn (file:///app/test_workflows/dist/workflows/llm/generate_text/steps.ts:9:28)
    at wrapper (file:///app/sdk/core/src/interface/step.js:12:26)
    at executeNextHandler (/app/node_modules/@temporalio/worker/lib/activity.js:99:54)` );

    expect( resolveInvocationDir() ).toBe( '/app/test_workflows/dist/workflows/llm/generate_text' );
  } );

  it( 'skips core and evals frames when installed via NPM', () => {
    mockStack( `Error
    at resolveInvocationDir (file:///app/node_modules/@outputai/core/src/helpers/path.js:27:17)
    at loadPrompt (file:///app/node_modules/@outputai/core/src/llm/prompt/loader.js:38:64)
    at generateText (file:///app/node_modules/@outputai/core/src/llm/generate.js:51:18)
    at judgeVerdict (file:///app/node_modules/@outputai/evals/dist/judge.js:12:28)
    at fn (file:///app/dist/workflows/blog/evaluators.js:7:20)
    at wrapper (file:///app/node_modules/@outputai/core/src/interface/evaluator.js:14:26)` );

    expect( resolveInvocationDir() ).toBe( '/app/dist/workflows/blog' );
  } );

  it( 'skips additional ignore paths', () => {
    mockStack( `Error
    at resolveInvocationDir (file:///app/sdk/core/src/helpers/path.js:27:17)
    at helper (file:///app/dist/shared/prompt_helper.js:3:10)
    at fn (file:///app/dist/workflows/simple/steps.js:8:21)` );

    expect( resolveInvocationDir( [ '/dist/shared/' ] ) ).toBe( '/app/dist/workflows/simple' );
  } );

  it( 'throws when every frame is ignored', () => {
    mockStack( `Error
    at resolveInvocationDir (file:///app/sdk/core/src/helpers/path.js:27:17)
    at loadPrompt (file:///app/sdk/core/src/llm/prompt/loader.js:38:64)
    at ModuleJob.run (node:internal/modules/esm/module_job:365:25)` );

    expect( () => resolveInvocationDir() ).toThrow( 'Invocation dir resolution via stack trace failed' );
  } );
} );
