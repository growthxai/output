import { describe, it, expect } from 'vitest';
import type { CostReport, LLMCostResult } from '#types/cost.js';
import { formatCostReport } from '#utils/cost_formatter.js';

function llmResult( overrides: Partial<LLMCostResult> = {} ): LLMCostResult {
  return {
    step: 'gen',
    model: 'gemini-2.5-flash',
    input: 1032,
    output: 793,
    cached: 0,
    reasoning: 0,
    originalCost: 0.0037,
    adjustedCost: 0.0037,
    incomplete: false,
    ...overrides
  };
}

function report( llmCalls: LLMCostResult[] ): CostReport {
  const originalCost = llmCalls.reduce( ( s, c ) => s + c.originalCost, 0 );
  const adjustedCost = llmCalls.reduce( ( s, c ) => s + c.adjustedCost, 0 );
  return {
    traceFile: 'trace.json',
    workflowName: 'w',
    durationMs: 1000,
    llmCalls,
    llmOriginalCost: originalCost,
    llmAdjustedCost: adjustedCost,
    totalInputTokens: 1032,
    totalOutputTokens: 793,
    totalCachedTokens: 0,
    totalReasoningTokens: 0,
    httpCosts: [],
    httpOriginalCost: 0,
    httpAdjustedCost: 0,
    originalTotalCost: originalCost,
    totalCost: adjustedCost
  };
}

describe( 'formatCostReport incomplete marker', () => {
  it( 'marks the model row with an unpriced charge and prints the footnote', () => {
    const out = formatCostReport( report( [ llmResult( { model: 'gemini-2.5-flash', incomplete: true } ) ] ) );
    const modelRow = out.split( '\n' ).find( line => line.includes( 'gemini-2.5-flash' ) );
    expect( modelRow ).toContain( '$0.0037 *' );
    expect( out ).toContain( 'cost incomplete' );
  } );

  it( 'omits the marker and footnote when every call is fully priced', () => {
    const out = formatCostReport( report( [ llmResult() ] ) );
    const modelRow = out.split( '\n' ).find( line => line.includes( 'gemini-2.5-flash' ) );
    expect( modelRow ).not.toContain( '*' );
    expect( out ).not.toContain( 'cost incomplete' );
  } );

  it( 'marks the flagged call row in the verbose table', () => {
    const out = formatCostReport(
      report( [ llmResult( { step: 'grounded', incomplete: true } ), llmResult( { step: 'plain' } ) ] ),
      { verbose: true }
    );
    const lines = out.split( '\n' );
    const groundedRow = lines.find( line => line.includes( 'grounded' ) );
    const plainRow = lines.find( line => line.includes( 'plain' ) );
    expect( groundedRow ).toContain( '$0.0037 *' );
    expect( plainRow ).not.toContain( '*' );
    expect( out ).toContain( 'cost incomplete' );
  } );
} );
