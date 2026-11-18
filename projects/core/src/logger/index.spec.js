import { afterEach, describe, expect, it, vi } from 'vitest';

const loadLogger = async nodeEnv => {
  vi.resetModules();
  vi.stubEnv( 'NODE_ENV', nodeEnv );
  return import( './index.js' );
};

describe( 'logger/index', () => {
  afterEach( () => {
    vi.unstubAllEnvs();
  } );

  it( 'loads the development logger options', async () => {
    const { createChildLogger } = await loadLogger( 'development' );
    const log = createChildLogger( 'Test' );

    expect( typeof log.info ).toBe( 'function' );
  } );

  it( 'loads the production logger options', async () => {
    const { createChildLogger } = await loadLogger( 'production' );
    const log = createChildLogger( 'Test' );

    expect( typeof log.info ).toBe( 'function' );
  } );
} );
