import { describe, it, expect } from 'vitest';
import aggregateTraceAttributes, {
  COST_EVENT_LLM,
  COST_EVENT_HTTP,
  COST_EVENT_OTHER
} from './aggregate_trace_attributes.js';

const node = ( { id, kind = 'step', attributes = {}, output, children = [] } ) => ( {
  id,
  kind,
  name: id,
  startedAt: 0,
  endedAt: 0,
  input: undefined,
  output,
  attributes,
  children
} );

describe( 'aggregate_trace_attributes', () => {
  it( 'returns zeros for a null root', () => {
    const result = aggregateTraceAttributes( null );
    expect( result.cost.total ).toBe( 0 );
    expect( result.cost.components ).toEqual( [
      { name: COST_EVENT_LLM, value: 0 },
      { name: COST_EVENT_HTTP, value: 0 },
      { name: COST_EVENT_OTHER, value: 0 }
    ] );
    expect( result.tokenUsage ).toEqual( {
      inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0
    } );
  } );

  it( 'returns zeros for a tree with no cost or usage attributes', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      children: [ node( { id: 's1' } ), node( { id: 's2' } ) ]
    } );
    const result = aggregateTraceAttributes( root );
    expect( result.cost.total ).toBe( 0 );
    expect( result.tokenUsage.totalTokens ).toBe( 0 );
  } );

  it( 'buckets cost by node kind into llm / http / other components', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      children: [
        node( { id: 'llm-1', kind: 'llm', attributes: { cost: { total: 0.20 } } } ),
        node( { id: 'llm-2', kind: 'llm', attributes: { cost: { total: 0.10 } } } ),
        node( { id: 'http-1', kind: 'http', attributes: { cost: { total: 0.50 } } } ),
        // Unknown kind falls into the catch-all bucket
        node( { id: 'step-1', kind: 'step', attributes: { cost: { total: 0.07 } } } )
      ]
    } );
    const result = aggregateTraceAttributes( root );

    const byName = Object.fromEntries( result.cost.components.map( c => [ c.name, c.value ] ) );
    expect( byName[COST_EVENT_LLM] ).toBeCloseTo( 0.30, 10 );
    expect( byName[COST_EVENT_HTTP] ).toBeCloseTo( 0.50, 10 );
    expect( byName[COST_EVENT_OTHER] ).toBeCloseTo( 0.07, 10 );
    expect( result.cost.total ).toBeCloseTo( 0.87, 10 );
  } );

  it( 'total equals the sum of all components', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      children: [
        node( { id: 'llm-1', kind: 'llm', attributes: { cost: { total: 0.1234 } } } ),
        node( { id: 'http-1', kind: 'http', attributes: { cost: { total: 0.0011 } } } )
      ]
    } );
    const { cost } = aggregateTraceAttributes( root );
    const sum = cost.components.reduce( ( s, c ) => s + c.value, 0 );
    expect( cost.total ).toBeCloseTo( sum, 10 );
  } );

  it( 'sums token_usage across llm nodes from the attribute path', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      children: [
        node( {
          id: 'llm-1', kind: 'llm', attributes: {
            token_usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 5, totalTokens: 125 }
          }
        } ),
        node( {
          id: 'llm-2', kind: 'llm', attributes: {
            token_usage: { inputTokens: 50, outputTokens: 10, cachedInputTokens: 1, totalTokens: 61 }
          }
        } )
      ]
    } );
    const { tokenUsage } = aggregateTraceAttributes( root );
    expect( tokenUsage ).toEqual( {
      inputTokens: 150,
      outputTokens: 30,
      cachedInputTokens: 6,
      totalTokens: 186
    } );
  } );

  it( 'falls back to output.usage on legacy llm nodes that lack attributes.token_usage', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      children: [
        // Legacy shape — usage lives on output.usage, no attributes.token_usage
        node( {
          id: 'llm-legacy',
          kind: 'llm',
          output: { result: '...', usage: { inputTokens: 200, outputTokens: 40, totalTokens: 240 } }
        } )
      ]
    } );
    const { tokenUsage } = aggregateTraceAttributes( root );
    expect( tokenUsage.inputTokens ).toBe( 200 );
    expect( tokenUsage.outputTokens ).toBe( 40 );
    expect( tokenUsage.totalTokens ).toBe( 240 );
    expect( tokenUsage.cachedInputTokens ).toBe( 0 );
  } );

  it( 'prefers attributes.token_usage over output.usage when both are present', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      children: [
        node( {
          id: 'llm-1',
          kind: 'llm',
          attributes: { token_usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } },
          output: { usage: { inputTokens: 999, outputTokens: 999, totalTokens: 999 } }
        } )
      ]
    } );
    const { tokenUsage } = aggregateTraceAttributes( root );
    expect( tokenUsage.inputTokens ).toBe( 10 );
    expect( tokenUsage.totalTokens ).toBe( 12 );
  } );

  it( 'ignores token_usage shapes on non-llm nodes', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      // attributes.token_usage on a non-llm node is intentionally ignored —
      // only llm nodes contribute to the token-usage rollup today.
      children: [
        node( {
          id: 'step-1', kind: 'step', attributes: {
            token_usage: { inputTokens: 999, outputTokens: 999, totalTokens: 999 }
          }
        } )
      ]
    } );
    const { tokenUsage } = aggregateTraceAttributes( root );
    expect( tokenUsage.totalTokens ).toBe( 0 );
  } );

  it( 'aggregates a mixed tree with cost on http nodes and usage on llm nodes', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      children: [
        node( {
          id: 'llm-1',
          kind: 'llm',
          attributes: {
            cost: { total: 0.0038 },
            token_usage: { inputTokens: 2264, outputTokens: 411, cachedInputTokens: 100, totalTokens: 2775 }
          }
        } ),
        node( {
          id: 'http-1',
          kind: 'http',
          attributes: { cost: { total: 0.50 } }
        } )
      ]
    } );
    const result = aggregateTraceAttributes( root );

    const byName = Object.fromEntries( result.cost.components.map( c => [ c.name, c.value ] ) );
    expect( byName[COST_EVENT_LLM] ).toBeCloseTo( 0.0038, 10 );
    expect( byName[COST_EVENT_HTTP] ).toBeCloseTo( 0.50, 10 );
    expect( byName[COST_EVENT_OTHER] ).toBe( 0 );
    expect( result.cost.total ).toBeCloseTo( 0.5038, 10 );

    expect( result.tokenUsage ).toEqual( {
      inputTokens: 2264,
      outputTokens: 411,
      cachedInputTokens: 100,
      totalTokens: 2775
    } );
  } );

  it( 'recurses through nested children', () => {
    const root = node( {
      id: 'wf',
      kind: 'workflow',
      children: [
        node( {
          id: 's1',
          kind: 'step',
          children: [
            node( {
              id: 'llm-1', kind: 'llm', attributes: {
                cost: { total: 0.01 },
                token_usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
              }
            } )
          ]
        } )
      ]
    } );
    const result = aggregateTraceAttributes( root );
    expect( result.cost.total ).toBeCloseTo( 0.01, 10 );
    expect( result.tokenUsage.totalTokens ).toBe( 15 );
  } );

  it( 'keeps the canonical component ordering: llm, http, other', () => {
    const root = node( { id: 'wf', kind: 'workflow' } );
    const { cost } = aggregateTraceAttributes( root );
    expect( cost.components.map( c => c.name ) ).toEqual( [
      COST_EVENT_LLM,
      COST_EVENT_HTTP,
      COST_EVENT_OTHER
    ] );
  } );
} );
