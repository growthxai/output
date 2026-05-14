import { describe, it, expect } from 'vitest';
import { serializeError } from './utils.js';

describe( 'tracing/utils', () => {
  it( 'serializeError unwraps causes and keeps message/stack', () => {
    const inner = new Error( 'inner' );
    const outer = new Error( 'outer', { cause: inner } );

    const out = serializeError( outer );
    expect( out.name ).toBe( 'Error' );
    expect( out.message ).toBe( 'inner' );
    expect( typeof out.stack ).toBe( 'string' );
  } );
} );
