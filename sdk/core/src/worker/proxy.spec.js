import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSetGlobalDispatcher = vi.fn();
const MockEnvHttpProxyAgent = vi.fn();
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockGetProxyUrl = vi.fn();

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: MockEnvHttpProxyAgent,
  setGlobalDispatcher: mockSetGlobalDispatcher
} ) );

vi.mock( '#helpers/proxy', () => ( {
  getProxyUrl: mockGetProxyUrl
} ) );

vi.mock( '#logger', () => ( {
  createChildLogger: () => mockLogger
} ) );

describe( 'worker/proxy', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockGetProxyUrl.mockReturnValue( null );
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
    mockGetProxyUrl.mockReturnValue( 'http://proxy:8080/' );
    const { bootstrapFetchProxy } = await import( './proxy.js' );
    bootstrapFetchProxy();

    expect( MockEnvHttpProxyAgent ).toHaveBeenCalledWith( { allowH2: false } );
    expect( mockSetGlobalDispatcher ).toHaveBeenCalledTimes( 1 );
    expect( mockLogger.info ).toHaveBeenCalledWith(
      'Routing fetch() through HTTP proxy',
      { url: 'http://proxy:8080/' }
    );
  } );

  it( 'propagates proxy URL errors without setting global dispatcher', async () => {
    const error = new Error( 'Invalid proxy URL' );
    mockGetProxyUrl.mockImplementation( () => {
      throw error;
    } );
    const { bootstrapFetchProxy } = await import( './proxy.js' );

    expect( () => bootstrapFetchProxy() ).toThrow( error );
    expect( MockEnvHttpProxyAgent ).not.toHaveBeenCalled();
    expect( mockSetGlobalDispatcher ).not.toHaveBeenCalled();
  } );
} );
