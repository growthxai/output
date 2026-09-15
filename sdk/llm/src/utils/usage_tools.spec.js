import { describe, expect, it } from 'vitest';
import { extractUsageFromSteps } from './usage_tools.js';

const usage = ( { input, noCache, cacheRead, cacheWrite, output, text, reasoning } ) => ( {
  inputTokens: input,
  inputTokenDetails: { noCacheTokens: noCache, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite },
  outputTokens: output,
  outputTokenDetails: { textTokens: text, reasoningTokens: reasoning }
} );

const step = fields => ( { usage: usage( fields ) } );

describe( 'extractUsageFromSteps', () => {
  it( 'sums aggregate tokens and detail breakdowns across steps', () => {
    const result = extractUsageFromSteps( [
      step( { input: 100, noCache: 70, cacheRead: 30, cacheWrite: 0, output: 10, text: 8, reasoning: 2 } ),
      step( { input: 200, noCache: 150, cacheRead: 50, cacheWrite: 0, output: 20, text: 12, reasoning: 8 } )
    ] );

    expect( result ).toEqual( {
      inputTokens: 300,
      inputTokenDetails: { noCacheTokens: 220, cacheReadTokens: 80, cacheWriteTokens: 0 },
      outputTokens: 30,
      outputTokenDetails: { textTokens: 20, reasoningTokens: 10 }
    } );
  } );

  it( 'leaves fields undefined when no step reports them', () => {
    const result = extractUsageFromSteps( [
      step( { input: 100, output: 10 } ),
      step( { input: 50, output: 5 } )
    ] );

    expect( result.inputTokens ).toBe( 150 );
    expect( result.outputTokens ).toBe( 15 );
    expect( result.inputTokenDetails.noCacheTokens ).toBeUndefined();
    expect( result.inputTokenDetails.cacheReadTokens ).toBeUndefined();
    expect( result.inputTokenDetails.cacheWriteTokens ).toBeUndefined();
    expect( result.outputTokenDetails.textTokens ).toBeUndefined();
    expect( result.outputTokenDetails.reasoningTokens ).toBeUndefined();
  } );

  it( 'counts a missing value as zero when another step reports it', () => {
    const result = extractUsageFromSteps( [
      step( { input: 100, noCache: 100, output: 10, text: 10 } ),
      step( { input: 200, output: 20 } )
    ] );

    expect( result ).toEqual( {
      inputTokens: 300,
      inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: undefined, cacheWriteTokens: undefined },
      outputTokens: 30,
      outputTokenDetails: { textTokens: 10, reasoningTokens: undefined }
    } );
  } );

  it( 'skips steps that carry no usage', () => {
    const result = extractUsageFromSteps( [
      step( { input: 100, output: 10 } ),
      { usage: null },
      {},
      null,
      step( { input: 200, output: 20 } )
    ] );

    expect( result ).toMatchObject( { inputTokens: 300, outputTokens: 30 } );
  } );

  it( 'returns an empty object when no step carries usage', () => {
    expect( extractUsageFromSteps( [] ) ).toEqual( {} );
    expect( extractUsageFromSteps( [ {}, { usage: undefined } ] ) ).toEqual( {} );
  } );

  it( 'preserves a single step usage as the total', () => {
    const result = extractUsageFromSteps( [ step( { input: 100, noCache: 100, output: 10, text: 10 } ) ] );

    expect( result ).toMatchObject( {
      inputTokens: 100,
      inputTokenDetails: { noCacheTokens: 100 },
      outputTokens: 10,
      outputTokenDetails: { textTokens: 10 }
    } );
  } );

  it( 'does not mutate the provided steps', () => {
    const steps = [
      step( { input: 100, noCache: 100, output: 10, text: 10 } ),
      step( { input: 200, noCache: 200, output: 20, text: 20 } )
    ];
    const snapshot = structuredClone( steps );

    extractUsageFromSteps( steps );

    expect( steps ).toEqual( snapshot );
  } );
} );
