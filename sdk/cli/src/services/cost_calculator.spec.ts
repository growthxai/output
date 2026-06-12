import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TraceNode, HTTPCall, LLMUsageLine } from '#types/cost.js';

const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn();
vi.mock( 'node:fs', () => ( {
  readFileSync: ( ...args: unknown[] ) => mockReadFileSync( ...args ),
  existsSync: ( ...args: unknown[] ) => mockExistsSync( ...args )
} ) );

const mockLoad = vi.fn();
vi.mock( 'js-yaml', () => ( {
  default: { load: ( ...args: unknown[] ) => mockLoad( ...args ) }
} ) );

import {
  extractValue,
  findLLMCalls,
  findHTTPCalls,
  calculateLLMCallCost,
  identifyService,
  calculateServiceCost,
  calculateCost,
  loadPricingConfig
} from '#services/cost_calculator.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function llmLines(
  inAmt: number, inPpm: number,
  outAmt: number, outPpm: number,
  cachedAmt = 0, cachedPpm = 0
): LLMUsageLine[] {
  return [
    { type: 'input', ppm: inPpm, amount: inAmt, total: ( inAmt / 1e6 ) * inPpm },
    { type: 'input_cached', ppm: cachedPpm, amount: cachedAmt, total: ( cachedAmt / 1e6 ) * cachedPpm },
    { type: 'output', ppm: outPpm, amount: outAmt, total: ( outAmt / 1e6 ) * outPpm }
  ];
}

function llmEventNode( id: string, model: string, lines: LLMUsageLine[] ): TraceNode {
  const total = lines.reduce( ( s, l ) => s + l.total, 0 );
  return {
    id,
    kind: 'llm',
    name: 'gen',
    attributes: {
      'llm:usage': {
        type: 'llm:usage',
        modelId: model,
        usage: lines,
        total,
        tokensUsed: lines.reduce( ( s, l ) => s + l.amount, 0 )
      }
    }
  };
}

function httpEventNode(
  id: string, url: string, method: string, total: number,
  output: Record<string, unknown> = { status: 200, body: {} },
  inputBody?: Record<string, unknown>
): TraceNode {
  return {
    id,
    kind: 'http',
    name: 'request',
    input: { url, method, ...( inputBody ? { body: inputBody } : {} ) },
    output,
    attributes: {
      'http:request:cost': { type: 'http:request:cost', url, requestId: id, total }
    }
  };
}

// Legacy traces (no attributes events) — exercise the costs.yml fallback path.

const llmTrace: TraceNode = {
  id: 'test-trace-1',
  kind: 'workflow',
  name: 'test_workflow',
  startedAt: 1700000000000,
  endedAt: 1700000100000,
  children: [
    {
      id: 'step-1',
      kind: 'step',
      name: 'test_workflow#generate_summary',
      children: [
        {
          id: 'llm-1',
          kind: 'llm',
          name: 'generate_summary',
          input: { loadedPrompt: { config: { model: 'claude-sonnet-4-5' } } },
          output: { usage: { inputTokens: 1000, outputTokens: 500 } }
        }
      ]
    },
    {
      id: 'step-2',
      kind: 'step',
      name: 'test_workflow#analyze_data',
      children: [
        {
          id: 'llm-2',
          kind: 'llm',
          name: 'analyze_data',
          input: { loadedPrompt: { config: { model: 'claude-haiku-4-5' } } },
          output: { usage: { inputTokens: 2000, outputTokens: 1000, cachedInputTokens: 500 } }
        }
      ]
    }
  ]
};

const httpTrace: TraceNode = {
  id: 'test-trace-2',
  kind: 'workflow',
  name: 'test_workflow',
  startedAt: 1700000000000,
  endedAt: 1700000100000,
  children: [
    {
      id: 'step-1',
      kind: 'step',
      name: 'test_workflow#fetch_content',
      children: [
        {
          id: 'http-1',
          kind: 'http',
          name: 'jina_request',
          input: { url: 'https://r.jina.ai/https://example.com', method: 'GET' },
          output: { status: 200, body: { data: { usage: { tokens: 5000 } } } }
        }
      ]
    },
    {
      id: 'step-2',
      kind: 'step',
      name: 'test_workflow#search',
      children: [
        {
          id: 'http-2',
          kind: 'http',
          name: 'exa_request',
          input: { url: 'https://api.exa.ai/research', method: 'GET' },
          output: {
            status: 200,
            body: {
              model: 'exa-research',
              costDollars: { total: 0.15, numSearches: 1, numPages: 5 }
            }
          }
        }
      ]
    }
  ]
};

const duplicateTrace: TraceNode = {
  id: 'test-trace-3',
  kind: 'workflow',
  name: 'test_workflow',
  startedAt: 1700000000000,
  endedAt: 1700000100000,
  children: [
    {
      id: 'step-1',
      kind: 'step',
      name: 'test_workflow#step_one',
      children: [
        {
          id: 'llm-same-id',
          kind: 'llm',
          name: 'generate',
          input: { loadedPrompt: { config: { model: 'claude-sonnet-4-5' } } },
          output: { usage: { inputTokens: 1000, outputTokens: 500 } }
        }
      ]
    },
    {
      id: 'child-workflow',
      kind: 'workflow',
      name: 'child_workflow',
      children: [
        {
          id: 'llm-same-id',
          kind: 'llm',
          name: 'generate',
          input: { loadedPrompt: { config: { model: 'claude-sonnet-4-5' } } },
          output: { usage: { inputTokens: 1000, outputTokens: 500 } }
        }
      ]
    }
  ]
};

const testConfig = {
  models: {
    'claude-sonnet-4-5': { provider: 'anthropic', input: 3.0, output: 15.0, cached_input: 0.30 },
    'claude-haiku-4-5': { provider: 'anthropic', input: 1.0, output: 5.0, cached_input: 0.10 },
    'claude-opus-4': { provider: 'anthropic', input: 15.0, output: 75.0, cached_input: 1.50 }
  },
  services: {
    jina: {
      type: 'token' as const,
      url_pattern: 'r.jina.ai',
      usage_path: 'body.data.usage.tokens',
      per_million: 0.045
    },
    exa: {
      type: 'response_cost' as const,
      url_pattern: 'api.exa.ai',
      cost_path: 'output.body.costDollars.total',
      billable_method: 'POST'
    },
    tavily: {
      type: 'request' as const,
      url_pattern: 'api.tavily.com',
      endpoints: {
        search: { pattern: '/search', price: 0.01 },
        extract: { pattern: '/extract', price_per_item: 0.005, items_path: 'body.urls' }
      }
    }
  }
};

describe( 'extractValue', () => {
  it( 'extracts nested values with dot notation', () => {
    const obj = { a: { b: { c: 42 } } };
    expect( extractValue( obj, 'a.b.c' ) ).toBe( 42 );
  } );

  it( 'extracts array values with bracket notation', () => {
    const obj = { items: [ { name: 'first' }, { name: 'second' } ] };
    expect( extractValue( obj, 'items[0].name' ) ).toBe( 'first' );
    expect( extractValue( obj, 'items[1].name' ) ).toBe( 'second' );
  } );

  it( 'returns undefined for missing paths', () => {
    const obj = { a: 1 };
    expect( extractValue( obj, 'b.c.d' ) ).toBeUndefined();
  } );

  it( 'handles null/undefined input', () => {
    expect( extractValue( null, 'a.b' ) ).toBeNull();
    expect( extractValue( undefined, 'a.b' ) ).toBeUndefined();
  } );
} );

describe( 'findLLMCalls', () => {
  it( 'finds nested LLM calls (legacy output.usage)', () => {
    const calls = findLLMCalls( llmTrace );
    expect( calls ).toHaveLength( 2 );
  } );

  it( 'extracts step names correctly', () => {
    const calls = findLLMCalls( llmTrace );
    expect( calls[0].stepName ).toBe( 'generate_summary' );
    expect( calls[1].stepName ).toBe( 'analyze_data' );
  } );

  it( 'extracts model names from loadedPrompt config', () => {
    const calls = findLLMCalls( llmTrace );
    expect( calls[0].model ).toBe( 'claude-sonnet-4-5' );
    expect( calls[1].model ).toBe( 'claude-haiku-4-5' );
  } );

  it( 'extracts token usage', () => {
    const calls = findLLMCalls( llmTrace );
    expect( calls[0].usage.inputTokens ).toBe( 1000 );
    expect( calls[0].usage.outputTokens ).toBe( 500 );
    expect( calls[1].usage.cachedInputTokens ).toBe( 500 );
  } );

  it( 'reads model, tokens and as-charged cost from llm:usage event', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmEventNode( 'llm-ev', 'gpt-5.5', llmLines( 27400, 5, 7275, 30 ) ) ]
    };
    const calls = findLLMCalls( trace );
    expect( calls ).toHaveLength( 1 );
    expect( calls[0].model ).toBe( 'gpt-5.5' );
    expect( calls[0].usage.inputTokens ).toBe( 27400 );
    expect( calls[0].usage.outputTokens ).toBe( 7275 );
    expect( calls[0].originalCost ).toBeCloseTo( 0.35525, 5 );
  } );

  it( 'deduplicates by ID', () => {
    const calls = findLLMCalls( duplicateTrace );
    expect( calls ).toHaveLength( 1 );
  } );

  it( 'deduplicates event-bearing nodes by ID', () => {
    const lines = llmLines( 1000, 1, 1000, 5 );
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [
        llmEventNode( 'dup', 'claude-haiku-4-5', lines ),
        llmEventNode( 'dup', 'claude-haiku-4-5', lines )
      ]
    };
    expect( findLLMCalls( trace ) ).toHaveLength( 1 );
  } );
} );

describe( 'findHTTPCalls', () => {
  it( 'finds nested HTTP calls', () => {
    const calls = findHTTPCalls( httpTrace );
    expect( calls ).toHaveLength( 2 );
  } );

  it( 'extracts URLs, methods and host', () => {
    const calls = findHTTPCalls( httpTrace );
    expect( calls[0].url ).toContain( 'r.jina.ai' );
    expect( calls[0].method ).toBe( 'GET' );
    expect( calls[0].host ).toBe( 'r.jina.ai' );
  } );

  it( 'extracts step names', () => {
    const calls = findHTTPCalls( httpTrace );
    expect( calls[0].stepName ).toBe( 'fetch_content' );
    expect( calls[1].stepName ).toBe( 'search' );
  } );

  it( 'reads host and as-charged cost from http:request:cost event', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode( 'req-1', 'https://api.exa.ai/search', 'POST', 0.012 ) ]
    };
    const calls = findHTTPCalls( trace );
    expect( calls ).toHaveLength( 1 );
    expect( calls[0].host ).toBe( 'api.exa.ai' );
    expect( calls[0].originalCost ).toBe( 0.012 );
    expect( calls[0].requestId ).toBe( 'req-1' );
  } );
} );

describe( 'calculateLLMCallCost', () => {
  it( 'calculates cost for known model', () => {
    const usage = { inputTokens: 1000000, outputTokens: 500000 };
    const modelPricing = { provider: 'anthropic', input: 3.0, output: 15.0 };

    const { cost } = calculateLLMCallCost( usage, modelPricing );
    // 1M input * $3/M + 0.5M output * $15/M = $3 + $7.5 = $10.5
    expect( cost ).toBeCloseTo( 10.5, 2 );
  } );

  it( 'charges cached tokens at the cached rate only (inputTokens includes them)', () => {
    const usage = { inputTokens: 1000000, outputTokens: 0, cachedInputTokens: 600000 };
    const modelPricing = { provider: 'anthropic', input: 3.0, output: 15.0, cached_input: 0.3 };

    const { cost } = calculateLLMCallCost( usage, modelPricing );
    // 0.4M non-cached * $3/M + 0.6M cached * $0.3/M = $1.2 + $0.18 = $1.38
    expect( cost ).toBeCloseTo( 1.38, 2 );
  } );

  it( 'returns zero with warning for unknown model', () => {
    const usage = { inputTokens: 1000, outputTokens: 500 };
    const { cost, warning } = calculateLLMCallCost( usage, undefined );

    expect( cost ).toBe( 0 );
    expect( warning ).toBe( 'unknown model' );
  } );
} );

describe( 'identifyService', () => {
  const baseCall = ( url: string ): HTTPCall => ( {
    stepName: 'test', url, method: 'GET', input: {}, output: {}, host: url
  } );

  it( 'identifies Jina by URL pattern', () => {
    const result = identifyService( baseCall( 'https://r.jina.ai/https://example.com' ), testConfig.services );
    expect( result?.serviceName ).toBe( 'jina' );
  } );

  it( 'identifies Exa by URL pattern', () => {
    const result = identifyService( baseCall( 'https://api.exa.ai/research' ), testConfig.services );
    expect( result?.serviceName ).toBe( 'exa' );
  } );

  it( 'returns null for unknown URLs', () => {
    const result = identifyService( baseCall( 'https://unknown-api.com/endpoint' ), testConfig.services );
    expect( result ).toBeNull();
  } );
} );

describe( 'calculateServiceCost', () => {
  it( 'calculates Jina token-based cost', () => {
    const call: HTTPCall = {
      stepName: 'test',
      url: 'https://r.jina.ai/https://example.com',
      method: 'GET',
      host: 'r.jina.ai',
      input: {},
      output: { body: { data: { usage: { tokens: 1000000 } } } }
    };

    const serviceInfo = identifyService( call, testConfig.services )!;
    const result = calculateServiceCost( call, serviceInfo );

    // 1M tokens * $0.045/M = $0.045
    expect( result.cost ).toBeCloseTo( 0.045, 4 );
  } );

  it( 'extracts Exa cost from response body', () => {
    const call: HTTPCall = {
      stepName: 'test',
      url: 'https://api.exa.ai/research',
      method: 'GET',
      host: 'api.exa.ai',
      input: {},
      output: {
        body: { model: 'exa-research', costDollars: { total: 0.15, numSearches: 1, numPages: 5 } }
      }
    };

    const serviceInfo = identifyService( call, testConfig.services )!;
    const result = calculateServiceCost( call, serviceInfo );

    expect( result.cost ).toBe( 0.15 );
    expect( result.usage ).toContain( '1 searches' );
    expect( result.usage ).toContain( '5 pages' );
  } );

  it( 'returns zero cost for Exa response without costDollars', () => {
    const call: HTTPCall = {
      stepName: 'test',
      url: 'https://api.exa.ai/research',
      method: 'GET',
      host: 'api.exa.ai',
      input: {},
      output: { body: { status: 'pending' } }
    };

    const serviceInfo = identifyService( call, testConfig.services )!;
    const result = calculateServiceCost( call, serviceInfo );

    expect( result.cost ).toBe( 0 );
    expect( result.warning ).toBe( 'no cost data' );
  } );
} );

describe( 'legacy HTTP path (no cost events)', () => {
  it( 'skips Exa polling requests without cost data', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test_workflow',
      children: [
        {
          id: 'http-exa-poll',
          kind: 'http',
          name: 'exa_poll',
          input: { url: 'https://api.exa.ai/research/task-123', method: 'GET' },
          output: { status: 200, body: { status: 'in_progress' } }
        }
      ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpAdjustedCost ).toBe( 0 );
    expect( report.httpCosts ).toHaveLength( 0 );
  } );

  it( 'counts Exa responses that have costDollars', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test_workflow',
      children: [
        {
          id: 'http-exa-poll',
          kind: 'http',
          name: 'exa_poll',
          input: { url: 'https://api.exa.ai/research/task-123', method: 'GET' },
          output: { status: 200, body: { status: 'in_progress' } }
        },
        {
          id: 'http-exa-result',
          kind: 'http',
          name: 'exa_result',
          input: { url: 'https://api.exa.ai/research/task-123', method: 'GET' },
          output: {
            status: 200,
            body: { model: 'exa-research', costDollars: { total: 0.08, numSearches: 1, numPages: 3 } }
          }
        }
      ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts ).toHaveLength( 1 );
    expect( report.httpCosts[0].host ).toBe( 'api.exa.ai' );
    expect( report.httpCosts[0].calls ).toHaveLength( 1 );
    expect( report.httpCosts[0].adjustedTotalCost ).toBeCloseTo( 0.08, 4 );
    expect( report.httpCosts[0].originalTotalCost ).toBeCloseTo( 0.08, 4 );
  } );
} );

describe( 'calculateCost (legacy LLM)', () => {
  it( 'calculates total cost for LLM trace', () => {
    const report = calculateCost( llmTrace, testConfig, 'test.json' );

    expect( report.llmCalls ).toHaveLength( 2 );
    expect( report.workflowName ).toBe( 'test_workflow' );
    expect( report.llmAdjustedCost ).toBeGreaterThan( 0 );
    expect( report.totalCost ).toBe( report.adjustedTotalCost );
    expect( report.adjustedTotalCost ).toBe( report.llmAdjustedCost + report.httpAdjustedCost );
  } );

  it( 'calculates total cost for HTTP trace', () => {
    const report = calculateCost( httpTrace, testConfig, 'test.json' );

    expect( report.httpCosts.length ).toBeGreaterThan( 0 );
    expect( report.httpAdjustedCost ).toBeGreaterThan( 0 );
  } );

  it( 'calculates duration from timestamps', () => {
    const report = calculateCost( llmTrace, testConfig, 'test.json' );
    expect( report.durationMs ).toBe( 100000 );
  } );

  it( 'handles deduplication in cost calculation', () => {
    const report = calculateCost( duplicateTrace, testConfig, 'test.json' );
    expect( report.llmCalls ).toHaveLength( 1 );
  } );

  it( 'matches versioned model names by prefix', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ {
        id: 'llm-1',
        kind: 'llm',
        name: 'gen',
        input: { loadedPrompt: { config: { model: 'claude-sonnet-4-5-20250514' } } },
        output: { usage: { inputTokens: 1000, outputTokens: 500 } }
      } ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmAdjustedCost ).toBeGreaterThan( 0 );
    expect( report.unconfiguredModels ).toHaveLength( 0 );
    expect( report.llmCalls[0].note ).toBe( 'priced as claude-sonnet-4-5' );
  } );

  it( 'reports unconfigured model when no prefix match exists', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ {
        id: 'llm-1',
        kind: 'llm',
        name: 'gen',
        input: { loadedPrompt: { config: { model: 'totally-unknown-model' } } },
        output: { usage: { inputTokens: 1000, outputTokens: 500 } }
      } ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmAdjustedCost ).toBe( 0 );
    expect( report.unconfiguredModels ).toContain( 'totally-unknown-model' );
    expect( report.llmCalls[0].note ).toBe( 'unknown model' );
  } );

  it( 'prefers exact model match over prefix', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ {
        id: 'llm-1',
        kind: 'llm',
        name: 'gen',
        input: { loadedPrompt: { config: { model: 'claude-sonnet-4-5' } } },
        output: { usage: { inputTokens: 1000, outputTokens: 500 } }
      } ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmCalls[0].note ).toBeUndefined();
  } );
} );

describe( 'event-driven LLM costs (original vs adjusted)', () => {
  it( 'matches original when costs.yml rate equals the event rate', () => {
    // haiku event priced at the same rate as testConfig (input 1 / output 5)
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmEventNode( 'h', 'claude-haiku-4-5', llmLines( 1_000_000, 1, 1_000_000, 5 ) ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmCalls[0].originalCost ).toBeCloseTo( 6, 5 );
    expect( report.llmCalls[0].adjustedCost ).toBeCloseTo( 6, 5 );
    expect( report.llmCalls[0].note ).toBeUndefined();
  } );

  it( 'overrides via prefix match when the configured rate differs (opus-4-8 → opus-4)', () => {
    // event charged at 5/25; costs.yml has no opus-4-8, prefix-matches opus-4 at 15/75
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmEventNode( 'o', 'claude-opus-4-8', llmLines( 1_000_000, 5, 1_000_000, 25 ) ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmCalls[0].originalCost ).toBeCloseTo( 30, 5 );
    expect( report.llmCalls[0].adjustedCost ).toBeCloseTo( 90, 5 );
    expect( report.llmCalls[0].note ).toBe( 'priced as claude-opus-4' );
    expect( report.llmOriginalCost ).toBeCloseTo( 30, 5 );
    expect( report.llmAdjustedCost ).toBeCloseTo( 90, 5 );
  } );

  it( 'leaves adjusted equal to original for a model not in costs.yml (gpt-5.5)', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmEventNode( 'g', 'gpt-5.5', llmLines( 27400, 5, 7275, 30 ) ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmCalls[0].originalCost ).toBeCloseTo( 0.35525, 5 );
    expect( report.llmCalls[0].adjustedCost ).toBeCloseTo( 0.35525, 5 );
    expect( report.llmCalls[0].note ).toBe( 'no costs.yml override' );
    expect( report.unconfiguredModels ).toContain( 'gpt-5.5' );
  } );

  it( 'prices an unknown line type at its as-charged total, not $0', () => {
    const lines = [
      ...llmLines( 1_000_000, 1, 1_000_000, 5 ),
      { type: 'input_cache_write', ppm: 1.25, amount: 200_000, total: 0.25 }
    ];
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmEventNode( 'cw', 'claude-haiku-4-5', lines ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    // known lines reprice to $6 at config rates; unknown line passes through at $0.25
    expect( report.llmCalls[0].adjustedCost ).toBeCloseTo( 6.25, 5 );
    expect( report.llmCalls[0].originalCost ).toBeCloseTo( 6.25, 5 );
  } );

  it( 'reports inputTokens including cached tokens for event traces', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmEventNode( 'c', 'claude-haiku-4-5', llmLines( 1000, 1, 500, 5, 600, 0.1 ) ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    // producer 'input' line excludes cached — display restores the AI SDK total
    expect( report.llmCalls[0].input ).toBe( 1600 );
    expect( report.llmCalls[0].cached ).toBe( 600 );
    // repriced: 1000@$1/M + 600@$0.1/M + 500@$5/M
    expect( report.llmCalls[0].adjustedCost ).toBeCloseTo( 0.00356, 6 );
  } );
} );

describe( 'event-driven HTTP costs (original vs adjusted)', () => {
  it( 'falls back to as-charged cost when service recompute is not usable', () => {
    // exa POST with a cost event but no costDollars body → recompute is $0 → use event
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode( 'exa-1', 'https://api.exa.ai/search', 'POST', 0.012 ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts ).toHaveLength( 1 );
    expect( report.httpCosts[0].host ).toBe( 'api.exa.ai' );
    expect( report.httpCosts[0].originalTotalCost ).toBeCloseTo( 0.012, 5 );
    expect( report.httpCosts[0].adjustedTotalCost ).toBeCloseTo( 0.012, 5 );
    expect( report.httpCosts[0].calls[0].note ).toMatch( /as-charged/ );
  } );

  it( 'overrides with the recomputed cost for a request-based service (tavily)', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode( 'tv-1', 'https://api.tavily.com/search', 'POST', 0.008 ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts[0].host ).toBe( 'api.tavily.com' );
    expect( report.httpCosts[0].originalTotalCost ).toBeCloseTo( 0.008, 5 );
    expect( report.httpCosts[0].adjustedTotalCost ).toBeCloseTo( 0.01, 5 );
  } );

  it( 'uses as-charged cost for an unconfigured host (firecrawl)', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode( 'fc-1', 'https://api.firecrawl.dev/v1/scrape', 'POST', 0.0008 ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts[0].host ).toBe( 'api.firecrawl.dev' );
    expect( report.httpCosts[0].originalTotalCost ).toBeCloseTo( 0.0008, 5 );
    expect( report.httpCosts[0].adjustedTotalCost ).toBeCloseTo( 0.0008, 5 );
  } );

  it( 'counts an event-bearing 4xx call as-charged (the event proves a charge)', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode(
        'fc-429', 'https://api.firecrawl.dev/v1/scrape', 'POST', 0.10,
        { status: 429, body: {} }
      ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts ).toHaveLength( 1 );
    expect( report.httpCosts[0].originalTotalCost ).toBeCloseTo( 0.10, 5 );
    expect( report.httpCosts[0].adjustedTotalCost ).toBeCloseTo( 0.10, 5 );
  } );

  it( 'prices eventless billable calls via costs.yml even when other calls carry events', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [
        httpEventNode( 'fc-1', 'https://api.firecrawl.dev/v1/scrape', 'POST', 0.05 ),
        // jina call from an uninstrumented client — no cost event, but token
        // usage in the body lets costs.yml price it
        {
          id: 'jina-legacy',
          kind: 'http',
          name: 'request',
          input: { url: 'https://r.jina.ai/https://example.com', method: 'GET' },
          output: { status: 200, body: { data: { usage: { tokens: 1000000 } } } }
        }
      ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    const jina = report.httpCosts.find( h => h.host === 'r.jina.ai' );
    expect( jina ).toBeDefined();
    expect( jina!.adjustedTotalCost ).toBeCloseTo( 0.045, 4 );
    expect( report.httpCosts.find( h => h.host === 'api.firecrawl.dev' ) ).toBeDefined();
  } );

  it( 'applies a legitimately computed $0 override', () => {
    const config = {
      ...testConfig,
      services: {
        ...testConfig.services,
        tavily: {
          type: 'request' as const,
          url_pattern: 'api.tavily.com',
          endpoints: { search: { pattern: '/search', price: 0 } }
        }
      }
    };
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode( 'tv-free', 'https://api.tavily.com/search', 'POST', 0.008 ) ]
    };
    const report = calculateCost( trace, config, 'test.json' );
    expect( report.httpCosts[0].originalTotalCost ).toBeCloseTo( 0.008, 5 );
    expect( report.httpCosts[0].adjustedTotalCost ).toBe( 0 );
  } );

  it( 'does not let a fallback estimate override an exact event cost', () => {
    const config = {
      ...testConfig,
      services: {
        ...testConfig.services,
        exa: {
          ...testConfig.services.exa,
          fallback_models: { 'exa-research': 0.10 },
          default_fallback: 0.10
        }
      }
    };
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode( 'exa-est', 'https://api.exa.ai/search', 'POST', 0.012 ) ]
    };
    const report = calculateCost( trace, config, 'test.json' );
    expect( report.httpCosts[0].adjustedTotalCost ).toBeCloseTo( 0.012, 5 );
    expect( report.httpCosts[0].calls[0].note ).toMatch( /as-charged/ );
  } );

  it( 'treats an un-captured request body as failed, preserving the as-charged cost', () => {
    // tavily /extract is price_per_item over body.urls — body missing from trace
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode( 'tv-x', 'https://api.tavily.com/extract', 'POST', 0.015 ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts[0].adjustedTotalCost ).toBeCloseTo( 0.015, 5 );
    expect( report.httpCosts[0].calls[0].note ).toMatch( /as-charged/ );
  } );

  it( 'overrides with a real measured item count, including an empty array', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ httpEventNode(
        'tv-0', 'https://api.tavily.com/extract', 'POST', 0.015,
        { status: 200, body: {} },
        { urls: [] }
      ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts[0].originalTotalCost ).toBeCloseTo( 0.015, 5 );
    expect( report.httpCosts[0].adjustedTotalCost ).toBe( 0 );
  } );

  it( 'ignores count-only nodes and groups billable requests by host', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [
        // count-only webhook (no cost event) — must be excluded
        {
          id: 'wh-1',
          kind: 'http',
          name: 'request',
          input: { url: 'https://os.growthx.ai/webhooks/output', method: 'POST' },
          attributes: {
            'http:request:count': {
              type: 'http:request:count',
              url: 'https://os.growthx.ai/webhooks/output',
              requestId: 'wh-1'
            }
          }
        },
        httpEventNode( 'fc-1', 'https://api.firecrawl.dev/v1/scrape', 'POST', 0.10 ),
        httpEventNode( 'fc-2', 'https://api.firecrawl.dev/v1/scrape', 'POST', 0.05 )
      ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts ).toHaveLength( 1 );
    expect( report.httpCosts[0].host ).toBe( 'api.firecrawl.dev' );
    expect( report.httpCosts[0].calls ).toHaveLength( 2 );
    expect( report.httpCosts[0].originalTotalCost ).toBeCloseTo( 0.15, 5 );
  } );
} );

describe( 'loadPricingConfig', () => {
  beforeEach( () => {
    mockReadFileSync.mockReset();
    mockLoad.mockReset();
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue( false );
  } );

  it( 'loads bundled config when no project config exists', () => {
    const yamlContent = 'models: {}';
    const parsed = { models: {}, services: {} };
    mockReadFileSync.mockReturnValue( yamlContent );
    mockLoad.mockReturnValue( parsed );

    const result = loadPricingConfig();

    expect( mockReadFileSync ).toHaveBeenCalledTimes( 1 );
    expect( mockLoad ).toHaveBeenCalledWith( yamlContent );
    expect( result ).toEqual( parsed );
  } );

  it( 'loads config from custom path without merging', () => {
    const yamlContent = 'models: {}';
    const parsed = { models: {}, services: {} };
    mockReadFileSync.mockReturnValue( yamlContent );
    mockLoad.mockReturnValue( parsed );

    loadPricingConfig( '/custom/path/costs.yml' );

    expect( mockReadFileSync ).toHaveBeenCalledWith( '/custom/path/costs.yml', 'utf-8' );
    expect( mockExistsSync ).not.toHaveBeenCalled();
  } );

  it( 'merges project config over bundled config', () => {
    const bundled = {
      models: { 'claude-sonnet-4-5': { provider: 'anthropic', input: 3.0, output: 15.0 } },
      services: { jina: { type: 'token', url_pattern: 'r.jina.ai', per_million: 0.045 } }
    };
    const project = {
      models: { 'custom-model': { provider: 'custom', input: 1.0, output: 2.0 } },
      services: {}
    };

    mockExistsSync.mockReturnValue( true );
    mockReadFileSync.mockReturnValue( 'yaml' );
    mockLoad
      .mockReturnValueOnce( bundled )
      .mockReturnValueOnce( project );

    const result = loadPricingConfig();

    expect( mockReadFileSync ).toHaveBeenCalledTimes( 2 );
    expect( result.models ).toHaveProperty( 'claude-sonnet-4-5' );
    expect( result.models ).toHaveProperty( 'custom-model' );
    expect( result.services ).toHaveProperty( 'jina' );
  } );

  it( 'project config overrides bundled model prices', () => {
    const bundled = {
      models: { 'claude-sonnet-4-5': { provider: 'anthropic', input: 3.0, output: 15.0 } },
      services: {}
    };
    const project = {
      models: { 'claude-sonnet-4-5': { provider: 'anthropic', input: 2.0, output: 10.0 } },
      services: {}
    };

    mockExistsSync.mockReturnValue( true );
    mockReadFileSync.mockReturnValue( 'yaml' );
    mockLoad
      .mockReturnValueOnce( bundled )
      .mockReturnValueOnce( project );

    const result = loadPricingConfig();

    expect( result.models['claude-sonnet-4-5'].input ).toBe( 2.0 );
    expect( result.models['claude-sonnet-4-5'].output ).toBe( 10.0 );
  } );
} );
