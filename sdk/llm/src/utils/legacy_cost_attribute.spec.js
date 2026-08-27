import { describe, expect, it } from 'vitest';
import { convertCostToLegacy } from './legacy_cost_attribute.js';

const MODEL_ID = 'test-model';
const INPUT = 'input';
const OUTPUT = 'output';
const OK = 'ok';
const FALLBACK = 'fallback';
const MISSING = 'missing';

const item = ( group, label, amount, ppm, total, status = OK ) => ( {
  group,
  label,
  amount,
  ppm,
  total,
  status
} );

const cost = items => ( { modelId: MODEL_ID, items } );

describe( 'convertCostToLegacy', () => {
  it( 'returns null without a cost', () => {
    expect( convertCostToLegacy( null ) ).toBeNull();
  } );

  it( 'returns null when there are no cost items', () => {
    expect( convertCostToLegacy( cost( [] ) ) ).toBeNull();
  } );

  it( 'returns null when every cost item is missing', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, null, 100, null, null, MISSING ),
      item( INPUT, 'cache_read', 20, null, null, MISSING ),
      item( OUTPUT, null, 50, null, null, MISSING )
    ] ) ) ).toBeNull();
  } );

  it( 'converts aggregate input and output items', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, null, 100, 2, 0.0002 ),
      item( OUTPUT, null, 50, 10, 0.0005 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 2, amount: 100, total: 0.0002 },
        { type: 'output', ppm: 10, amount: 50, total: 0.0005 }
      ],
      total: 0.0007,
      tokensUsed: 150
    } );
  } );

  it( 'converts every detailed input and output item', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, 'no_cache', 500_000, 4, 2 ),
      item( INPUT, 'cache_read', 400_000, 1, 0.4 ),
      item( INPUT, 'cache_write', 100_000, 5, 0.5 ),
      item( OUTPUT, 'text', 200_000, 10, 2 ),
      item( OUTPUT, 'reasoning', 50_000, 20, 1 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 4, amount: 600_000, total: 2.4 },
        { type: 'input_cached', ppm: 1, amount: 400_000, total: 0.4 },
        { type: 'output', ppm: 10, amount: 200_000, total: 2 },
        { type: 'reasoning', ppm: 20, amount: 50_000, total: 1 }
      ],
      total: 5.8,
      tokensUsed: 1_250_000
    } );
  } );

  it( 'converts no-cache input without other input details', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, 'no_cache', 100, 2, 0.0002 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 2, amount: 100, total: 0.0002 }
      ],
      total: 0.0002,
      tokensUsed: 100
    } );
  } );

  it( 'converts cache-write input without a no-cache item', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, 'cache_write', 100, 5, 0.0005 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 5, amount: 100, total: 0.0005 }
      ],
      total: 0.0005,
      tokensUsed: 100
    } );
  } );

  it( 'uses no-cache ppm when folding cache-write input', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, 'no_cache', 0, 2, 0 ),
      item( INPUT, 'cache_write', 100, 5, 0.0005 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 2, amount: 100, total: 0.0002 }
      ],
      total: 0.0002,
      tokensUsed: 100
    } );
  } );

  it( 'converts exactly priced cache reads', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, 'cache_read', 200, 1, 0.0002 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input_cached', ppm: 1, amount: 200, total: 0.0002 }
      ],
      total: 0.0002,
      tokensUsed: 200
    } );
  } );

  it.each( [ FALLBACK, MISSING ] )(
    'converts %s cache reads using the legacy zero price',
    status => {
      expect( convertCostToLegacy( cost( [
        item( INPUT, 'cache_read', 200, status === FALLBACK ? 2 : null, status === FALLBACK ? 0.0004 : null, status ),
        item( OUTPUT, null, 50, 10, 0.0005 )
      ] ) ) ).toEqual( {
        type: 'llm:usage',
        modelId: MODEL_ID,
        usage: [
          { type: 'input_cached', ppm: 0, amount: 200, total: 0 },
          { type: 'output', ppm: 10, amount: 50, total: 0.0005 }
        ],
        total: 0.0005,
        tokensUsed: 250
      } );
    }
  );

  it( 'gives aggregate input precedence over detailed input items', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, null, 100, 2, 0.0002 ),
      item( INPUT, 'no_cache', 60, 2, 0.00012 ),
      item( INPUT, 'cache_read', 20, 1, 0.00002 ),
      item( INPUT, 'cache_write', 20, 3, 0.00006 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 2, amount: 100, total: 0.0002 }
      ],
      total: 0.0002,
      tokensUsed: 100
    } );
  } );

  it( 'converts text output without reasoning', () => {
    expect( convertCostToLegacy( cost( [
      item( OUTPUT, 'text', 50, 10, 0.0005 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'output', ppm: 10, amount: 50, total: 0.0005 }
      ],
      total: 0.0005,
      tokensUsed: 50
    } );
  } );

  it( 'converts reasoning output without text', () => {
    expect( convertCostToLegacy( cost( [
      item( OUTPUT, 'reasoning', 50, 20, 0.001 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'reasoning', ppm: 20, amount: 50, total: 0.001 }
      ],
      total: 0.001,
      tokensUsed: 50
    } );
  } );

  it( 'gives aggregate output precedence over detailed output items', () => {
    expect( convertCostToLegacy( cost( [
      item( OUTPUT, null, 70, 10, 0.0007 ),
      item( OUTPUT, 'text', 20, 10, 0.0002 ),
      item( OUTPUT, 'reasoning', 50, 20, 0.001 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'output', ppm: 10, amount: 70, total: 0.0007 }
      ],
      total: 0.0007,
      tokensUsed: 70
    } );
  } );

  it( 'omits unpriced aggregate and detailed items from a partially priced cost', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, null, 100, null, null, MISSING ),
      item( INPUT, 'no_cache', 100, null, null, MISSING ),
      item( INPUT, 'cache_write', 20, null, null, MISSING ),
      item( OUTPUT, null, 50, null, null, MISSING ),
      item( OUTPUT, 'text', 40, null, null, MISSING ),
      item( OUTPUT, 'reasoning', 10, null, null, MISSING ),
      item( INPUT, 'cache_read', 25, null, null, MISSING ),
      item( OUTPUT, 'text', 5, 10, 0.00005, OK )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input_cached', ppm: 0, amount: 25, total: 0 },
        { type: 'output', ppm: 10, amount: 5, total: 0.00005 }
      ],
      total: 0.00005,
      tokensUsed: 30
    } );
  } );

  it( 'preserves zero amounts and prices', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, 'no_cache', 0, 0, 0 ),
      item( INPUT, 'cache_read', 0, 0, 0 ),
      item( OUTPUT, 'text', 0, 0, 0 ),
      item( OUTPUT, 'reasoning', 0, 0, 0 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 0, amount: 0, total: 0 },
        { type: 'input_cached', ppm: 0, amount: 0, total: 0 },
        { type: 'output', ppm: 0, amount: 0, total: 0 },
        { type: 'reasoning', ppm: 0, amount: 0, total: 0 }
      ],
      total: 0,
      tokensUsed: 0
    } );
  } );

  it( 'recalculates line and aggregate totals from amount and ppm', () => {
    expect( convertCostToLegacy( cost( [
      item( INPUT, null, 333_333, 3, 999 ),
      item( OUTPUT, null, 100_000, 7, 999 )
    ] ) ) ).toEqual( {
      type: 'llm:usage',
      modelId: MODEL_ID,
      usage: [
        { type: 'input', ppm: 3, amount: 333_333, total: 0.999999 },
        { type: 'output', ppm: 7, amount: 100_000, total: 0.7 }
      ],
      total: 1.699999,
      tokensUsed: 433_333
    } );
  } );
} );
