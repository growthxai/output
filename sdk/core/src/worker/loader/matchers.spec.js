import { describe, it, expect } from 'vitest';
import { sep } from 'node:path';
import { buildActivityMatcher, staticMatchers } from './matchers.js';

describe( 'buildActivityMatcher', () => {
  const base = `${sep}app${sep}proj`;

  it( 'matches steps.js at the base path', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}steps.js` ) ).toBe( true );
  } );

  it( 'matches evaluators.js at the base path', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}evaluators.js` ) ).toBe( true );
  } );

  it( 'matches files under the steps directory', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}steps${sep}a.js` ) ).toBe( true );
    expect( matchActivity( `${base}${sep}steps${sep}sub${sep}b.js` ) ).toBe( true );
  } );

  it( 'matches files under the evaluators directory', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}evaluators${sep}x.js` ) ).toBe( true );
    expect( matchActivity( `${base}${sep}evaluators${sep}y${sep}z.js` ) ).toBe( true );
  } );

  it( 'rejects activity filenames outside the base path', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}nested${sep}steps.js` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}sub${sep}evaluators.js` ) ).toBe( false );
    expect( matchActivity( `${sep}app${sep}other${sep}steps.js` ) ).toBe( false );
  } );

  it( 'rejects non-activity names at the base path', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}workflow.js` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}shared${sep}steps${sep}a.js` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}other${sep}a.js` ) ).toBe( false );
  } );

  it( 'rejects similarly named files and directories', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}stepsXjs` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}evaluatorsXjs` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}steps-extra.js` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}evaluators-extra.js` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}steps_extra${sep}a.js` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}evaluators_extra${sep}a.js` ) ).toBe( false );
  } );

  it( 'rejects directory names without a nested path', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}steps` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}evaluators` ) ).toBe( false );
  } );

  it( 'rejects exact files when additional path segments follow', () => {
    const matchActivity = buildActivityMatcher( base );

    expect( matchActivity( `${base}${sep}steps.js${sep}extra.js` ) ).toBe( false );
    expect( matchActivity( `${base}${sep}evaluators.js${sep}extra.js` ) ).toBe( false );
  } );

  it( 'escapes regular expression characters in the base path', () => {
    const specialBase = `${sep}app${sep}proj.with-symbols+(test)`;
    const matchActivity = buildActivityMatcher( specialBase );

    expect( matchActivity( `${specialBase}${sep}steps.js` ) ).toBe( true );
    expect( matchActivity( `${sep}app${sep}projXwith-symbols+(test)${sep}steps.js` ) ).toBe( false );
  } );
} );

describe( 'staticMatchers', () => {
  describe( 'workflowFile', () => {
    it( 'matches paths ending with path separator and workflow.js', () => {
      expect( staticMatchers.workflowFile( `${sep}x${sep}y${sep}workflow.js` ) ).toBe( true );
    } );

    it( 'rejects workflow.ts', () => {
      expect( staticMatchers.workflowFile( `${sep}a${sep}workflow.ts` ) ).toBe( false );
    } );
  } );

  describe( 'workflowPathHasShared', () => {
    it( 'matches workflow.js under a shared folder segment', () => {
      expect( staticMatchers.workflowPathHasShared( `${sep}foo${sep}shared${sep}workflow.js` ) ).toBe( true );
    } );

    it( 'rejects workflow.js not under shared', () => {
      expect( staticMatchers.workflowPathHasShared( `${sep}foo${sep}workflow.js` ) ).toBe( false );
    } );
  } );

  describe( 'sharedStepsDir', () => {
    it( 'matches .js files inside shared/steps/', () => {
      expect( staticMatchers.sharedStepsDir( `${sep}app${sep}dist${sep}shared${sep}steps${sep}tools.js` ) ).toBe( true );
    } );

    it( 'matches .js files in nested subdirectories of shared/steps/', () => {
      expect( staticMatchers.sharedStepsDir( `${sep}app${sep}dist${sep}shared${sep}steps${sep}utils${sep}helper.js` ) ).toBe( true );
    } );

    it( 'rejects .ts files inside shared/steps/', () => {
      expect( staticMatchers.sharedStepsDir( `${sep}app${sep}src${sep}shared${sep}steps${sep}tools.ts` ) ).toBe( false );
    } );

    it( 'rejects non-.js files inside shared/steps/', () => {
      expect( staticMatchers.sharedStepsDir( `${sep}app${sep}dist${sep}shared${sep}steps${sep}readme.md` ) ).toBe( false );
    } );
  } );

  describe( 'sharedEvaluatorsDir', () => {
    it( 'matches .js files inside shared/evaluators/', () => {
      expect( staticMatchers.sharedEvaluatorsDir( `${sep}app${sep}dist${sep}shared${sep}evaluators${sep}quality.js` ) ).toBe( true );
    } );

    it( 'matches .js files in nested subdirectories of shared/evaluators/', () => {
      expect( staticMatchers.sharedEvaluatorsDir( `${sep}app${sep}dist${sep}shared${sep}evaluators${sep}utils${sep}helper.js` ) ).toBe( true );
    } );

    it( 'rejects .ts files inside shared/evaluators/', () => {
      expect( staticMatchers.sharedEvaluatorsDir( `${sep}app${sep}src${sep}shared${sep}evaluators${sep}quality.ts` ) ).toBe( false );
    } );

    it( 'rejects non-.js files inside shared/evaluators/', () => {
      expect( staticMatchers.sharedEvaluatorsDir( `${sep}app${sep}dist${sep}shared${sep}evaluators${sep}readme.md` ) ).toBe( false );
    } );
  } );
} );
