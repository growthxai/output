import { afterEach, describe, expect, it, vi } from 'vitest';

const SHIPPED_PROVIDERS = [
  { name: 'anthropic', pkg: '@ai-sdk/anthropic', exportName: 'createAnthropic' },
  { name: 'azure', pkg: '@ai-sdk/azure', exportName: 'createAzure' },
  { name: 'bedrock', pkg: '@ai-sdk/amazon-bedrock', exportName: 'createAmazonBedrock' },
  { name: 'openai', pkg: '@ai-sdk/openai', exportName: 'createOpenAI' },
  { name: 'perplexity', pkg: '@ai-sdk/perplexity', exportName: 'createPerplexity' },
  { name: 'vertex', pkg: '@ai-sdk/google-vertex', exportName: 'createVertex' }
];

const makeProviderModules = () => Object.fromEntries(
  SHIPPED_PROVIDERS.map( ( { name, pkg, exportName } ) => [
    pkg,
    {
      [exportName]: vi.fn( options => ( { name, options } ) )
    }
  ] )
);

const importWithMockedProviders = async ( modules = makeProviderModules() ) => {
  await vi.resetModules();

  for ( const { pkg, exportName } of SHIPPED_PROVIDERS ) {
    vi.doMock( pkg, () => ( {
      [exportName]: modules[pkg][exportName]
    } ) );
  }

  return {
    modules,
    ...( await import( './ai_provider.js' ) )
  };
};

afterEach( () => {
  for ( const { pkg } of SHIPPED_PROVIDERS ) {
    vi.doUnmock( pkg );
  }
  vi.resetModules();
  vi.restoreAllMocks();
} );

describe( 'getProvider', () => {
  it( 'does not initialize shipped providers on import', async () => {
    const { modules } = await importWithMockedProviders();

    for ( const { pkg, exportName } of SHIPPED_PROVIDERS ) {
      expect( modules[pkg][exportName] ).not.toHaveBeenCalled();
    }
  } );

  it( 'initializes each shipped provider with custom fetch when requested', async () => {
    const { modules, getProvider } = await importWithMockedProviders();

    for ( const { name, pkg, exportName } of SHIPPED_PROVIDERS ) {
      const provider = getProvider( name );

      expect( provider ).toMatchObject( { name, options: { fetch: expect.any( Function ) } } );
      expect( modules[pkg][exportName] ).toHaveBeenCalledWith( { fetch: expect.any( Function ) } );
    }
  } );

  it( 'can import and initialize all installed shipped providers', async () => {
    const { getProvider } = await import( './ai_provider.js' );

    for ( const { name } of SHIPPED_PROVIDERS ) {
      expect( getProvider( name ) ).toEqual( expect.any( Function ) );
    }
  } );

  it( 'caches initialized providers', async () => {
    const { modules, getProvider } = await importWithMockedProviders();

    const first = getProvider( 'openai' );
    const second = getProvider( 'openai' );

    expect( second ).toBe( first );
    expect( modules['@ai-sdk/openai'].createOpenAI ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'uses registered providers before shipped providers', async () => {
    const { modules, getProvider, registerProvider } = await importWithMockedProviders();
    const customProvider = vi.fn( model => ( { provider: 'custom', model } ) );

    registerProvider( 'openai', customProvider );

    expect( getProvider( 'openai' ) ).toBe( customProvider );
    expect( modules['@ai-sdk/openai'].createOpenAI ).not.toHaveBeenCalled();
  } );

  it( 'throws FatalError for unsupported providers', async () => {
    const { getProvider } = await importWithMockedProviders();

    expect( () => getProvider( 'not-real' ) ).toThrow( 'Unsupported provider "not-real"' );
  } );

  it( 'throws a friendly error when provider initialization fails', async () => {
    const modules = makeProviderModules();
    modules['@ai-sdk/openai'].createOpenAI.mockImplementation( () => {
      throw new Error( 'Missing OpenAI API key' );
    } );
    const { getProvider } = await importWithMockedProviders( modules );

    expect( () => getProvider( 'openai' ) ).toThrow(
      'Failed to initialize provider "openai": Missing OpenAI API key'
    );
  } );
} );

describe( 'registerProvider', () => {
  it( 'registers custom providers', async () => {
    const { getProvider, getProviderNames, registerProvider } = await importWithMockedProviders();
    const customProvider = vi.fn();

    registerProvider( 'custom', customProvider );

    expect( getProvider( 'custom' ) ).toBe( customProvider );
    expect( getProviderNames() ).toContain( 'custom' );
  } );

  it( 'validates provider registration arguments', async () => {
    const { registerProvider } = await importWithMockedProviders();

    expect( () => registerProvider( '', vi.fn() ) ).toThrow( 'Provider name must be a non-empty string' );
    expect( () => registerProvider( 'custom', 'not-a-function' ) ).toThrow( 'expected function, received string' );
  } );
} );

describe( 'getProviderNames', () => {
  it( 'returns shipped and registered provider names without duplicates', async () => {
    const { getProviderNames, registerProvider } = await importWithMockedProviders();

    registerProvider( 'custom', vi.fn() );
    registerProvider( 'openai', vi.fn() );

    expect( getProviderNames() ).toEqual( [
      'anthropic',
      'azure',
      'bedrock',
      'openai',
      'perplexity',
      'vertex',
      'custom'
    ] );
  } );
} );
