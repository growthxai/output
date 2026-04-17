import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSetGlobalDispatcher = vi.fn();
const MockEnvHttpProxyAgent = vi.fn();

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: MockEnvHttpProxyAgent,
  setGlobalDispatcher: mockSetGlobalDispatcher
} ) );

vi.mock( '#logger', () => ( {
  createChildLogger: () => ( { info: vi.fn(), warn: vi.fn(), error: vi.fn() } )
} ) );

describe( 'worker/proxy', () => {
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
    const { bootstrapFetchProxy } = await import( './proxy.js' );
    bootstrapFetchProxy();

    expect( mockSetGlobalDispatcher ).not.toHaveBeenCalled();
  } );

  it( 'sets global dispatcher when HTTPS_PROXY is set', async () => {
    process.env.HTTPS_PROXY = 'http://proxy:8080';
    const { bootstrapFetchProxy } = await import( './proxy.js' );
    bootstrapFetchProxy();

    expect( MockEnvHttpProxyAgent ).toHaveBeenCalled();
    expect( mockSetGlobalDispatcher ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'sets global dispatcher when HTTP_PROXY is set', async () => {
    process.env.HTTP_PROXY = 'http://proxy:8080';
    const { bootstrapFetchProxy } = await import( './proxy.js' );
    bootstrapFetchProxy();

    expect( MockEnvHttpProxyAgent ).toHaveBeenCalled();
    expect( mockSetGlobalDispatcher ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'prefers HTTPS_PROXY over HTTP_PROXY for detection', async () => {
    process.env.HTTPS_PROXY = 'http://secure-proxy:8080';
    process.env.HTTP_PROXY = 'http://plain-proxy:8080';
    const { bootstrapFetchProxy } = await import( './proxy.js' );
    bootstrapFetchProxy();

    expect( mockSetGlobalDispatcher ).toHaveBeenCalledTimes( 1 );
  } );
} );
