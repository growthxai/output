import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSetGlobalDispatcher = vi.fn();
const MockEnvHttpProxyAgent = vi.fn();
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: MockEnvHttpProxyAgent,
  setGlobalDispatcher: mockSetGlobalDispatcher
} ) );

vi.mock( '#logger', () => ( {
  createChildLogger: () => mockLogger
} ) );

describe( 'worker/proxy', () => {
  const proxyEnv = [ 'http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY' ];

  beforeEach( () => {
    vi.clearAllMocks();
    for ( const key of proxyEnv ) {
      delete process.env[key];
    }
  } );

  afterEach( () => {
    vi.resetModules();
  } );

  it( 'does nothing when no proxy env vars are set', async () => {
    const { bootstrapFetchProxy } = await import( './proxy.js' );
    bootstrapFetchProxy();

    expect( MockEnvHttpProxyAgent ).not.toHaveBeenCalled();
    expect( mockSetGlobalDispatcher ).not.toHaveBeenCalled();
    expect( mockLogger.info ).not.toHaveBeenCalled();
  } );

  it( 'sets global dispatcher when proxy URL is available', async () => {
    process.env.HTTP_PROXY = 'http://proxy:8080/';
    const { bootstrapFetchProxy } = await import( './proxy.js' );
    bootstrapFetchProxy();

    expect( MockEnvHttpProxyAgent ).toHaveBeenCalledWith( { allowH2: false } );
    expect( mockSetGlobalDispatcher ).toHaveBeenCalledTimes( 1 );
    expect( mockLogger.info ).toHaveBeenCalledWith(
      'Proxy env vars detected, setting up global fetch dispatcher EnvHttpProxyAgent',
      { httpProxyUrl: 'http://proxy:8080/', httpsProxyUrl: undefined }
    );
  } );
} );
