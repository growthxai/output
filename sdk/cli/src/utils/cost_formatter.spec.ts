import { describe, it, expect } from 'vitest';
import { parseCostData, formatCostReport } from '#utils/cost_formatter.js';
import type { CostReport } from '#types/cost.js';

const report: CostReport = {
  traceFile: 'test.json',
  workflowName: 'wf',
  durationMs: 1000,
  llmCalls: [
    {
      step: 's1', model: 'm1', input: 10, output: 5, cached: 0, reasoning: 0,
      originalCost: 1, adjustedCost: 1, note: 'no costs.yml override'
    },
    {
      step: 's2', model: 'm1', input: 10, output: 5, cached: 0, reasoning: 0,
      originalCost: 0, adjustedCost: 0, note: 'unknown model'
    },
    {
      step: 's3', model: 'm1', input: 10, output: 5, cached: 0, reasoning: 0,
      originalCost: 1, adjustedCost: 1, note: 'no costs.yml override'
    }
  ],
  llmOriginalCost: 2,
  llmAdjustedCost: 2,
  totalInputTokens: 30,
  totalOutputTokens: 15,
  totalCachedTokens: 0,
  totalReasoningTokens: 0,
  unconfiguredModels: [ 'm1' ],
  httpCosts: [ {
    host: 'api.exa.ai',
    calls: [ {
      step: 's1', host: 'api.exa.ai', usage: 'as-charged',
      originalCost: 0.01, adjustedCost: 0.01,
      note: 'no usable costs.yml override; using as-charged'
    } ],
    originalTotalCost: 0.01,
    adjustedTotalCost: 0.01
  } ],
  httpOriginalCost: 0.01,
  httpAdjustedCost: 0.01,
  originalTotalCost: 2.01,
  adjustedTotalCost: 2.01,
  totalCost: 2.01
};

describe( 'parseCostData notes aggregation', () => {
  it( 'joins distinct notes per model instead of keeping the first', () => {
    const data = parseCostData( report );
    expect( data.llmModels[0].note ).toBe( 'no costs.yml override; unknown model' );
  } );

  it( 'aggregates distinct notes per host', () => {
    const data = parseCostData( report );
    expect( data.hosts[0].note ).toBe( 'no usable costs.yml override; using as-charged' );
  } );
} );

describe( 'formatCostReport pricing notes', () => {
  it( 'renders a Pricing notes footnote under both tables', () => {
    const out = formatCostReport( report );
    const apiIdx = out.indexOf( 'API Costs:' );
    expect( out.indexOf( 'Pricing notes:' ) ).toBeGreaterThan( -1 );
    expect( out.indexOf( 'Pricing notes:', apiIdx ) ).toBeGreaterThan( apiIdx );
    expect( out ).toContain( 'm1: no costs.yml override; unknown model' );
    expect( out ).toContain( 'api.exa.ai: no usable costs.yml override; using as-charged' );
  } );

  it( 'renders notes in verbose mode too', () => {
    const out = formatCostReport( report, { verbose: true } );
    expect( out ).toContain( 'Pricing notes:' );
    expect( out ).toContain( 'api.exa.ai: no usable costs.yml override; using as-charged' );
  } );
} );
