import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMGenerationCost, LLMGenerationUsage, LLMUsageEvent } from '@outputai/llm';
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
      } as LLMUsageEvent
    }
  };
}

function llmCostNode(
  id: string,
  model: string,
  items: LLMGenerationCost['items'],
  status: LLMGenerationCost['status'] = 'precise'
): TraceNode {
  const totalOf = ( group: LLMGenerationCost['items'][number]['group'] ): number =>
    items.filter( item => item.group === group ).reduce( ( sum, item ) => sum + ( item.total ?? 0 ), 0 );
  const input = totalOf( 'input' );
  const output = totalOf( 'output' );
  const request = totalOf( 'request' );

  return {
    id,
    kind: 'llm',
    name: 'gen',
    attributes: {
      'llm:generation:cost': {
        type: 'llm:generation:cost',
        providerId: 'test-provider',
        modelId: model,
        input,
        output,
        request,
        total: input + output + request,
        status,
        items
      }
    }
  };
}

function llmUsageNode( id: string, model: string, items: LLMGenerationUsage['items'] ): TraceNode {
  const totalOf = ( group: LLMGenerationUsage['items'][number]['group'] ): number =>
    items.filter( item => item.group === group ).reduce( ( sum, item ) => sum + item.amount, 0 );
  const input = totalOf( 'input' );
  const output = totalOf( 'output' );

  return {
    id,
    kind: 'llm',
    name: 'gen',
    attributes: {
      'llm:generation:usage': {
        type: 'llm:generation:usage',
        providerId: 'test-provider',
        modelId: model,
        input,
        output,
        total: input + output,
        status: 'complete',
        items
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
      children: [ llmEventNode( 'llm-1', 'claude-sonnet-4-5', llmLines( 1000, 3, 500, 15 ) ) ]
    },
    {
      id: 'step-2',
      kind: 'step',
      name: 'test_workflow#analyze_data',
      children: [ llmEventNode( 'llm-2', 'claude-haiku-4-5', llmLines( 1500, 1, 1000, 5, 500, 0.1 ) ) ]
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
      children: [ httpEventNode( 'http-1', 'https://r.jina.ai/https://example.com', 'GET', 0.0002 ) ]
    },
    {
      id: 'step-2',
      kind: 'step',
      name: 'test_workflow#search',
      children: [ httpEventNode( 'http-2', 'https://api.exa.ai/research', 'POST', 0.012 ) ]
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
      children: [ llmEventNode( 'llm-same-id', 'claude-sonnet-4-5', llmLines( 1000, 3, 500, 15 ) ) ]
    },
    {
      id: 'child-workflow',
      kind: 'workflow',
      name: 'child_workflow',
      children: [ llmEventNode( 'llm-same-id', 'claude-sonnet-4-5', llmLines( 1000, 3, 500, 15 ) ) ]
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
  it( 'finds nested LLM calls and extracts step names', () => {
    const calls = findLLMCalls( llmTrace );
    expect( calls ).toHaveLength( 2 );
    expect( calls[0].stepName ).toBe( 'generate_summary' );
    expect( calls[1].stepName ).toBe( 'analyze_data' );
    expect( calls[0].model ).toBe( 'claude-sonnet-4-5' );
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

  it( 'does not interpret transitional component names in legacy llm:usage events', () => {
    const node = llmEventNode( 'transitional-components', 'legacy-model', [
      { type: 'input', ppm: 1, amount: 10, total: 0.00001 },
      { type: 'input_cached', ppm: 0.1, amount: 20, total: 0.000002 },
      { type: 'output', ppm: 5, amount: 30, total: 0.00015 },
      { type: 'reasoning', ppm: 5, amount: 40, total: 0.0002 },
      { type: 'input_cache_read', ppm: 0.1, amount: 100, total: 0.00001 },
      { type: 'input_cache_write', ppm: 1.25, amount: 200, total: 0.00025 },
      { type: 'output_text', ppm: 5, amount: 300, total: 0.0015 },
      { type: 'output_reasoning', ppm: 5, amount: 400, total: 0.002 }
    ] );

    const calls = findLLMCalls( { kind: 'workflow', children: [ node ] } );

    expect( calls[0].usage ).toEqual( {
      inputTokens: 30,
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningTokens: 40
    } );
  } );

  it( 'reads every supported item from an llm:generation:cost attribute', () => {
    const items: LLMGenerationCost['items'] = [
      { group: 'input', label: null, amount: 100, ppm: 1, total: 0.0001, status: 'ok' },
      { group: 'input', label: 'no_cache', amount: 200, ppm: 1, total: 0.0002, status: 'ok' },
      { group: 'input', label: 'cache_write', amount: 300, ppm: 1.25, total: 0.000375, status: 'ok' },
      { group: 'input', label: 'cache_read', amount: 400, ppm: 0.1, total: 0.00004, status: 'ok' },
      { group: 'output', label: null, amount: 50, ppm: 5, total: 0.00025, status: 'ok' },
      { group: 'output', label: 'text', amount: 60, ppm: 5, total: 0.0003, status: 'ok' },
      { group: 'output', label: 'reasoning', amount: 70, ppm: 10, total: 0.0007, status: 'ok' }
    ];
    const calls = findLLMCalls( {
      kind: 'workflow',
      children: [ llmCostNode( 'llm-cost', 'new-model', items ) ]
    } );

    expect( calls ).toHaveLength( 1 );
    expect( calls[0] ).toMatchObject( {
      model: 'new-model',
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 400,
        outputTokens: 110,
        reasoningTokens: 70
      }
    } );
    expect( calls[0].lines.map( line => line.type ) ).toEqual( [
      'input',
      'input',
      'input_cache_write',
      'input_cache_read',
      'output',
      'output',
      'reasoning'
    ] );
    expect( calls[0].originalCost ).toBeCloseTo( 0.001965, 8 );
  } );

  it( 'reads a priced grounding request item without counting it as tokens', () => {
    const items: LLMGenerationCost['items'] = [
      { group: 'input', label: 'no_cache', amount: 1032, ppm: 0.3, total: 0.0003096, status: 'ok' },
      { group: 'output', label: 'text', amount: 793, ppm: 2.5, total: 0.0019825, status: 'ok' },
      { group: 'request', label: 'grounding_prompt', amount: 1, ppm: 35_000, total: 0.035, status: 'ok' }
    ];
    const calls = findLLMCalls( {
      kind: 'workflow',
      children: [ llmCostNode( 'grounded', 'gemini-2.5-flash', items ) ]
    } );

    expect( calls[0].incomplete ).toBe( false );
    expect( calls[0].originalCost ).toBeCloseTo( 0.0372921, 8 );
    // Grounding bills per request, so it must not inflate token usage.
    expect( calls[0].usage ).toEqual( {
      inputTokens: 1032,
      cachedInputTokens: 0,
      outputTokens: 793,
      reasoningTokens: 0
    } );
    expect( calls[0].lines.find( l => l.type === 'request_grounding_prompt' ) ).toEqual( {
      type: 'request_grounding_prompt',
      ppm: 35_000,
      amount: 1,
      total: 0.035
    } );
  } );

  it( 'preserves a priced grounding charge as-charged when re-pricing at costs.yml rates', () => {
    const items: LLMGenerationCost['items'] = [
      { group: 'input', label: 'no_cache', amount: 1032, ppm: 0.3, total: 0.0003096, status: 'ok' },
      { group: 'output', label: 'text', amount: 793, ppm: 2.5, total: 0.0019825, status: 'ok' },
      { group: 'request', label: 'grounding_prompt', amount: 1, ppm: 35_000, total: 0.035, status: 'ok' }
    ];
    const config = {
      models: { 'gemini-2.5-flash': { provider: 'google-vertex', input: 0.3, output: 2.5 } },
      services: {}
    };
    const report = calculateCost(
      { kind: 'workflow', name: 'w', children: [ llmCostNode( 'grounded', 'gemini-2.5-flash', items ) ] },
      config
    );

    // grounding has no costs.yml line rate, so it degrades to its as-charged total, not $0.
    expect( report.llmAdjustedCost ).toBeCloseTo( 0.0372921, 8 );
  } );

  it( 'flags an unrated grounding charge as incomplete instead of a silent $0', () => {
    const items: LLMGenerationCost['items'] = [
      { group: 'input', label: 'no_cache', amount: 1000, ppm: 1, total: 0.001, status: 'ok' },
      { group: 'output', label: null, amount: 500, ppm: 5, total: 0.0025, status: 'ok' },
      { group: 'request', label: 'grounding', amount: 3, ppm: null, total: null, status: 'missing' }
    ];
    const calls = findLLMCalls( {
      kind: 'workflow',
      children: [ llmCostNode( 'unrated', 'gemini-9-ultra', items, 'incomplete' ) ]
    } );

    expect( calls[0].incomplete ).toBe( true );
    // The unrated line still shows up (as $0), but the call carries the signal.
    expect( calls[0].lines.find( l => l.type === 'request_grounding' ) ).toEqual( {
      type: 'request_grounding',
      ppm: 0,
      amount: 3,
      total: 0
    } );
    expect( calls[0].usage ).toMatchObject( { inputTokens: 1000, outputTokens: 500 } );
  } );

  it( 'reads normalized usage without interpreting token totals as cost', () => {
    const items: LLMGenerationUsage['items'] = [
      { group: 'input', label: null, amount: 100 },
      { group: 'input', label: 'no_cache', amount: 200 },
      { group: 'input', label: 'cache_write', amount: 300 },
      { group: 'input', label: 'cache_read', amount: 400 },
      { group: 'output', label: null, amount: 50 },
      { group: 'output', label: 'text', amount: 60 },
      { group: 'output', label: 'reasoning', amount: 70 }
    ];
    const calls = findLLMCalls( {
      kind: 'workflow',
      children: [ llmUsageNode( 'llm-usage', 'new-model', items ) ]
    } );

    expect( calls ).toHaveLength( 1 );
    expect( calls[0] ).toMatchObject( {
      model: 'new-model',
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 400,
        outputTokens: 110,
        reasoningTokens: 70
      },
      originalCost: 0
    } );
    expect( calls[0].lines ).toEqual( [
      { type: 'input', ppm: 0, amount: 100, total: 0 },
      { type: 'input', ppm: 0, amount: 200, total: 0 },
      { type: 'input_cache_write', ppm: 0, amount: 300, total: 0 },
      { type: 'input_cache_read', ppm: 0, amount: 400, total: 0 },
      { type: 'output', ppm: 0, amount: 50, total: 0 },
      { type: 'output', ppm: 0, amount: 60, total: 0 },
      { type: 'reasoning', ppm: 0, amount: 70, total: 0 }
    ] );
  } );

  it( 'prefers generation cost when both generation attributes are present', () => {
    const node = llmCostNode( 'both', 'new-model', [
      { group: 'input', label: null, amount: 100, ppm: 1, total: 0.0001, status: 'ok' }
    ] );
    node.attributes!['llm:generation:usage'] = llmUsageNode( 'usage', 'usage-model', [
      { group: 'input', label: null, amount: 10 }
    ] )
      .attributes!['llm:generation:usage'];

    const calls = findLLMCalls( { kind: 'workflow', children: [ node ] } );

    expect( calls ).toHaveLength( 1 );
    expect( calls[0].model ).toBe( 'new-model' );
    expect( calls[0].originalCost ).toBe( 0.0001 );
  } );

  it( 'ignores llm nodes without a cost event', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ {
        id: 'llm-old',
        kind: 'llm',
        name: 'gen',
        input: { loadedPrompt: { config: { model: 'claude-sonnet-4-5' } } },
        output: { usage: { inputTokens: 1000, outputTokens: 500 } }
      } ]
    };
    expect( findLLMCalls( trace ) ).toHaveLength( 0 );
  } );

  it( 'deduplicates nodes by ID', () => {
    expect( findLLMCalls( duplicateTrace ) ).toHaveLength( 1 );
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

describe( 'calculateCost', () => {
  it( 'calculates total cost for LLM trace', () => {
    const report = calculateCost( llmTrace, testConfig, 'test.json' );

    expect( report.llmCalls ).toHaveLength( 2 );
    expect( report.workflowName ).toBe( 'test_workflow' );
    expect( report.llmAdjustedCost ).toBeGreaterThan( 0 );
    expect( report.totalCost ).toBe( report.llmAdjustedCost + report.httpAdjustedCost );
    expect( report.originalTotalCost ).toBe( report.llmOriginalCost + report.httpOriginalCost );
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

  it( 'uses the longest matching prefix for versioned model names', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [
        llmEventNode( 'llm-1', 'gpt-4.1-mini-20250514', llmLines( 1_000_000, 9, 1_000_000, 9 ) )
      ]
    };
    const config = {
      ...testConfig,
      models: {
        'gpt-4.1': { provider: 'openai', input: 2, output: 8 },
        'gpt-4.1-mini': { provider: 'openai', input: 0.4, output: 1.6 }
      }
    };

    const report = calculateCost( trace, config, 'test.json' );

    expect( report.llmCalls[0].adjustedCost ).toBeCloseTo( 2, 8 );
  } );
} );

describe( 'event-driven LLM costs (original vs adjusted)', () => {
  it( 're-prices normalized usage when generation cost is absent', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmUsageNode( 'usage-only', 'claude-sonnet-4-5', [
        { group: 'input', label: 'no_cache', amount: 1_000_000 },
        { group: 'input', label: 'cache_read', amount: 1_000_000 },
        { group: 'input', label: 'cache_write', amount: 1_000_000 },
        { group: 'output', label: 'text', amount: 1_000_000 },
        { group: 'output', label: 'reasoning', amount: 1_000_000 }
      ] ) ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );

    expect( report.llmCalls[0] ).toMatchObject( {
      input: 3_000_000,
      cached: 1_000_000,
      output: 1_000_000,
      reasoning: 1_000_000,
      originalCost: 0,
      adjustedCost: 36.3
    } );
    expect( report.llmOriginalCost ).toBe( 0 );
    expect( report.llmAdjustedCost ).toBeCloseTo( 36.3, 8 );
  } );

  it( 'falls back to input pricing for normalized cache reads', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmUsageNode( 'cache-read', 'cache-model', [
        { group: 'input', label: 'cache_read', amount: 1_000_000 }
      ] ) ]
    };
    const config = {
      ...testConfig,
      models: {
        'cache-model': { provider: 'test', input: 2, output: 10 }
      }
    };

    const report = calculateCost( trace, config, 'test.json' );

    expect( report.llmCalls[0].adjustedCost ).toBeCloseTo( 2, 8 );
  } );

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
  } );

  it( 're-prices normalized cache writes at the configured input rate', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ llmCostNode( 'cw', 'claude-haiku-4-5', [
        { group: 'input', label: 'no_cache', amount: 1_000_000, ppm: 1, total: 1, status: 'ok' },
        { group: 'input', label: 'cache_write', amount: 200_000, ppm: 1.25, total: 0.25, status: 'ok' },
        { group: 'output', label: 'text', amount: 1_000_000, ppm: 5, total: 5, status: 'ok' }
      ] ) ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmCalls[0].adjustedCost ).toBeCloseTo( 6.2, 5 );
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

  it( 'excludes eventless calls — only http:request:cost events are billable', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [
        httpEventNode( 'fc-1', 'https://api.firecrawl.dev/v1/scrape', 'POST', 0.05 ),
        // configured service with priceable body, but no cost event → not billed
        {
          id: 'jina-no-event',
          kind: 'http',
          name: 'request',
          input: { url: 'https://r.jina.ai/https://example.com', method: 'GET' },
          output: { status: 200, body: { data: { usage: { tokens: 1000000 } } } }
        }
      ]
    };
    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.httpCosts.find( h => h.host === 'r.jina.ai' ) ).toBeUndefined();
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
