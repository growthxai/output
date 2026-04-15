import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSetGlobalDispatcher = vi.fn();
const MockEnvHttpProxyAgent = vi.fn();

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: MockEnvHttpProxyAgent,
  setGlobalDispatcher: mockSetGlobalDispatcher
} ) );

describe( 'proxy bootstrap', () => {
  const originalEnv = { ...process.env };

  beforeEach( () => {
    vi.clearAllMocks();
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
  } );

  afterEach( () => {
    process.env = { ...originalEnv };
  } );

  it( 'does nothing when no proxy env vars are set', async () => {
    const { bootstrapProxy } = await import( './proxy.js' );
    bootstrapProxy();

    expect( mockSetGlobalDispatcher ).not.toHaveBeenCalled();
  } );

  it( 'sets global dispatcher when HTTPS_PROXY is set', async () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080';
    const { bootstrapProxy } = await import( './proxy.js' );
    bootstrapProxy();

    expect( MockEnvHttpProxyAgent ).toHaveBeenCalled();
    expect( mockSetGlobalDispatcher ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'sets global dispatcher when HTTP_PROXY is set', async () => {
    process.env.HTTP_PROXY = 'http://proxy:8080';
    const { bootstrapProxy } = await import( './proxy.js' );
    bootstrapProxy();

    expect( MockEnvHttpProxyAgent ).toHaveBeenCalled();
    expect( mockSetGlobalDispatcher ).toHaveBeenCalledTimes( 1 );
  } );
} );
