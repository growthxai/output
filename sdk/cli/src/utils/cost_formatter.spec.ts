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
  it( 'marks a model with an unpriced charge and prints the footnote', () => {
    const out = formatCostReport( report( [ llmResult( { incomplete: true } ) ] ) );
    expect( out ).toContain( '*' );
    expect( out ).toContain( 'cost incomplete' );
  } );

  it( 'omits the marker and footnote when every call is fully priced', () => {
    const out = formatCostReport( report( [ llmResult() ] ) );
    expect( out ).not.toContain( 'cost incomplete' );
  } );

  it( 'marks the flagged call in the verbose table', () => {
    const out = formatCostReport(
      report( [ llmResult( { step: 'grounded', incomplete: true } ) ] ),
      { verbose: true }
    );
    expect( out ).toContain( 'cost incomplete' );
  } );
} );
