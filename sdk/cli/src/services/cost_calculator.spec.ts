import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TraceNode, HTTPCall } from '#types/cost.js';

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
    'claude-haiku-4-5': { provider: 'anthropic', input: 1.0, output: 5.0, cached_input: 0.10 }
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
  it( 'finds nested LLM calls', () => {
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

  it( 'deduplicates by ID', () => {
    const calls = findLLMCalls( duplicateTrace );
    expect( calls ).toHaveLength( 1 );
  } );
} );

describe( 'findHTTPCalls', () => {
  it( 'finds nested HTTP calls', () => {
    const calls = findHTTPCalls( httpTrace );
    expect( calls ).toHaveLength( 2 );
  } );

  it( 'extracts URLs and methods', () => {
    const calls = findHTTPCalls( httpTrace );
    expect( calls[0].url ).toContain( 'r.jina.ai' );
    expect( calls[0].method ).toBe( 'GET' );
  } );

  it( 'extracts step names', () => {
    const calls = findHTTPCalls( httpTrace );
    expect( calls[0].stepName ).toBe( 'fetch_content' );
    expect( calls[1].stepName ).toBe( 'search' );
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

  it( 'includes cached input tokens at reduced rate', () => {
    const usage = { inputTokens: 1000000, outputTokens: 0, cachedInputTokens: 1000000 };
    const modelPricing = { provider: 'anthropic', input: 3.0, output: 15.0, cached_input: 0.3 };

    const { cost } = calculateLLMCallCost( usage, modelPricing );
    // 1M input * $3/M + 1M cached * $0.3/M = $3 + $0.3 = $3.3
    expect( cost ).toBeCloseTo( 3.3, 2 );
  } );

  it( 'returns zero with warning for unknown model', () => {
    const usage = { inputTokens: 1000, outputTokens: 500 };
    const { cost, warning } = calculateLLMCallCost( usage, undefined );

    expect( cost ).toBe( 0 );
    expect( warning ).toBe( 'unknown model' );
  } );
} );

describe( 'identifyService', () => {
  it( 'identifies Jina by URL pattern', () => {
    const call: HTTPCall = {
      stepName: 'test',
      url: 'https://r.jina.ai/https://example.com',
      method: 'GET',
      input: {},
      output: {}
    };

    const result = identifyService( call, testConfig.services );
    expect( result?.serviceName ).toBe( 'jina' );
  } );

  it( 'identifies Exa by URL pattern', () => {
    const call: HTTPCall = {
      stepName: 'test',
      url: 'https://api.exa.ai/research',
      method: 'GET',
      input: {},
      output: {}
    };

    const result = identifyService( call, testConfig.services );
    expect( result?.serviceName ).toBe( 'exa' );
  } );

  it( 'returns null for unknown URLs', () => {
    const call: HTTPCall = {
      stepName: 'test',
      url: 'https://unknown-api.com/endpoint',
      method: 'GET',
      input: {},
      output: {}
    };

    const result = identifyService( call, testConfig.services );
    expect( result ).toBeNull();
  } );
} );

describe( 'calculateServiceCost', () => {
  it( 'calculates Jina token-based cost', () => {
    const call: HTTPCall = {
      stepName: 'test',
      url: 'https://r.jina.ai/https://example.com',
      method: 'GET',
      input: {},
      output: {
        body: { data: { usage: { tokens: 1000000 } } }
      }
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
      input: {},
      output: {
        body: {
          model: 'exa-research',
          costDollars: { total: 0.15, numSearches: 1, numPages: 5 }
        }
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
      input: {},
      output: {
        body: { status: 'pending' }
      }
    };

    const serviceInfo = identifyService( call, testConfig.services )!;
    const result = calculateServiceCost( call, serviceInfo );

    expect( result.cost ).toBe( 0 );
    expect( result.warning ).toBe( 'no cost data' );
  } );
} );

describe( 'response_cost filtering in calculateCost', () => {
  it( 'skips Exa polling requests without cost data', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test_workflow',
      startedAt: 1700000000000,
      endedAt: 1700000100000,
      children: [
        {
          id: 'step-exa',
          kind: 'step',
          name: 'test_workflow#search',
          children: [
            {
              id: 'http-exa-poll',
              kind: 'http',
              name: 'exa_poll',
              input: { url: 'https://api.exa.ai/research/task-123', method: 'GET' },
              output: { status: 200, body: { status: 'in_progress' } }
            }
          ]
        }
      ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.serviceTotalCost ).toBe( 0 );
    expect( report.services ).toHaveLength( 0 );
  } );

  it( 'counts Exa responses that have costDollars', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test_workflow',
      startedAt: 1700000000000,
      endedAt: 1700000100000,
      children: [
        {
          id: 'step-exa',
          kind: 'step',
          name: 'test_workflow#search',
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
                body: {
                  model: 'exa-research',
                  costDollars: { total: 0.08, numSearches: 1, numPages: 3 }
                }
              }
            }
          ]
        }
      ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.services ).toHaveLength( 1 );
    expect( report.services[0].calls ).toHaveLength( 1 );
    expect( report.services[0].totalCost ).toBeCloseTo( 0.08, 4 );
  } );
} );

describe( 'calculateCost', () => {
  it( 'calculates total cost for LLM trace', () => {
    const report = calculateCost( llmTrace, testConfig, 'test.json' );

    expect( report.llmCalls ).toHaveLength( 2 );
    expect( report.workflowName ).toBe( 'test_workflow' );
    expect( report.llmTotalCost ).toBeGreaterThan( 0 );
    expect( report.totalCost ).toBe( report.llmTotalCost + report.serviceTotalCost );
  } );

  it( 'calculates total cost for HTTP trace', () => {
    const report = calculateCost( httpTrace, testConfig, 'test.json' );

    expect( report.services.length ).toBeGreaterThan( 0 );
    expect( report.serviceTotalCost ).toBeGreaterThan( 0 );
  } );

  it( 'calculates duration from timestamps', () => {
    const report = calculateCost( llmTrace, testConfig, 'test.json' );
    // 1700000100000 - 1700000000000 = 100000ms
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
        id: 'step-1',
        kind: 'step',
        name: 'test#gen',
        children: [ {
          id: 'llm-1',
          kind: 'llm',
          name: 'gen',
          input: { loadedPrompt: { config: { model: 'claude-sonnet-4-5-20250514' } } },
          output: { usage: { inputTokens: 1000, outputTokens: 500 } }
        } ]
      } ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmTotalCost ).toBeGreaterThan( 0 );
    expect( report.unknownModels ).toHaveLength( 0 );
    expect( report.llmCalls[0].warning ).toBe( 'priced as claude-sonnet-4-5' );
  } );

  it( 'reports unknown model when no prefix match exists', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ {
        id: 'step-1',
        kind: 'step',
        name: 'test#gen',
        children: [ {
          id: 'llm-1',
          kind: 'llm',
          name: 'gen',
          input: { loadedPrompt: { config: { model: 'totally-unknown-model' } } },
          output: { usage: { inputTokens: 1000, outputTokens: 500 } }
        } ]
      } ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmTotalCost ).toBe( 0 );
    expect( report.unknownModels ).toContain( 'totally-unknown-model' );
    expect( report.llmCalls[0].warning ).toBe( 'unknown model' );
  } );

  it( 'prefers exact model match over prefix', () => {
    const trace: TraceNode = {
      kind: 'workflow',
      name: 'test',
      children: [ {
        id: 'step-1',
        kind: 'step',
        name: 'test#gen',
        children: [ {
          id: 'llm-1',
          kind: 'llm',
          name: 'gen',
          input: { loadedPrompt: { config: { model: 'claude-sonnet-4-5' } } },
          output: { usage: { inputTokens: 1000, outputTokens: 500 } }
        } ]
      } ]
    };

    const report = calculateCost( trace, testConfig, 'test.json' );
    expect( report.llmCalls[0].warning ).toBeUndefined();
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
