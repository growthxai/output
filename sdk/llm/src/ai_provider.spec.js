import { afterEach, describe, expect, it, vi } from 'vitest';
const SHIPPED_PROVIDERS = [
  { name: 'anthropic', pkg: '@ai-sdk/anthropic', exportName: 'createAnthropic' },
  { name: 'azure', pkg: '@ai-sdk/azure', exportName: 'createAzure' },
  { name: 'bedrock', pkg: '@ai-sdk/amazon-bedrock', exportName: 'createAmazonBedrock' },
  { name: 'openai', pkg: '@ai-sdk/openai', exportName: 'createOpenAI' },
  { name: 'perplexity', pkg: '@ai-sdk/perplexity', exportName: 'createPerplexity' },
  { name: 'vertex', pkg: '@ai-sdk/google-vertex', exportName: 'createVertex' }
];

const moduleNotFoundError = ( pkg, requireStack = [ '/test.mjs' ] ) => Object.assign(
  new Error( `Cannot find module '${pkg}'\nRequire stack:\n${requireStack.map( item => `- ${item}` ).join( '\n' )}` ),
  { code: 'MODULE_NOT_FOUND' }
);

const importWithMockedRequire = async modules => {
  await vi.resetModules();

  const fakeRequire = vi.fn( pkg => {
    const result = modules[pkg];
    if ( result instanceof Error ) {
      throw result;
    }
    if ( !result ) {
      throw moduleNotFoundError( pkg );
    }
    return result;
  } );

  vi.doMock( 'module', async () => {
    const actual = await vi.importActual( 'module' );
    return {
      ...actual,
      createRequire: () => fakeRequire
    };
  } );

  return {
    fakeRequire,
    ...( await import( './ai_provider.js' ) )
  };
};

const makeProviderModules = () => Object.fromEntries(
  SHIPPED_PROVIDERS.map( ( { name, pkg, exportName } ) => [
    pkg,
    {
      [exportName]: vi.fn( options => ( { name, options } ) )
    }
  ] )
);

afterEach( () => {
  vi.doUnmock( 'module' );
  vi.resetModules();
  vi.restoreAllMocks();
} );

describe( 'getProvider', () => {
  it( 'loads each shipped provider with custom fetch', async () => {
    const modules = makeProviderModules();
    const { fakeRequire, getProvider } = await importWithMockedRequire( modules );

    for ( const { name, pkg, exportName } of SHIPPED_PROVIDERS ) {
      const provider = getProvider( name );

      expect( provider ).toMatchObject( { name, options: { fetch: expect.any( Function ) } } );
      expect( fakeRequire ).toHaveBeenCalledWith( pkg );
      expect( modules[pkg][exportName] ).toHaveBeenCalledWith( { fetch: expect.any( Function ) } );
    }
  } );

  it( 'can require all installed shipped provider packages', async () => {
    const { getProvider } = await import( './ai_provider.js' );

    for ( const { name } of SHIPPED_PROVIDERS ) {
      expect( getProvider( name ) ).toEqual( expect.any( Function ) );
    }
  } );

  it( 'caches loaded providers', async () => {
    const modules = makeProviderModules();
    const { fakeRequire, getProvider } = await importWithMockedRequire( modules );

    const first = getProvider( 'openai' );
    const second = getProvider( 'openai' );

    expect( second ).toBe( first );
    expect( fakeRequire ).toHaveBeenCalledTimes( 1 );
    expect( modules['@ai-sdk/openai'].createOpenAI ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'uses registered providers before shipped providers', async () => {
    const modules = makeProviderModules();
    const { fakeRequire, getProvider, registerProvider } = await importWithMockedRequire( modules );
    const customProvider = vi.fn( model => ( { provider: 'custom', model } ) );

    registerProvider( 'openai', customProvider );

    expect( getProvider( 'openai' ) ).toBe( customProvider );
    expect( fakeRequire ).not.toHaveBeenCalled();
  } );

  it( 'throws FatalError for unsupported providers', async () => {
    const { getProvider } = await importWithMockedRequire( {} );

    expect( () => getProvider( 'not-real' ) ).toThrow( 'Unsupported provider "not-real"' );
  } );

  it( 'throws a friendly error when an optional provider package is missing', async () => {
    const { getProvider } = await importWithMockedRequire( {
      '@ai-sdk/openai': moduleNotFoundError( '@ai-sdk/openai' )
    } );

    expect( () => getProvider( 'openai' ) ).toThrow(
      'Provider "openai" requires "@ai-sdk/openai". Install it to use this provider.'
    );
  } );

  it( 'rethrows module not found errors for transitive dependencies', async () => {
    const transitiveError = moduleNotFoundError( 'missing-transitive-package', [
      '/node_modules/@ai-sdk/openai/dist/index.js',
      '/test.mjs'
    ] );
    const { getProvider } = await importWithMockedRequire( {
      '@ai-sdk/openai': transitiveError
    } );

    expect( () => getProvider( 'openai' ) ).toThrow( transitiveError );
  } );

  it.each( [
    'ERR_REQUIRE_ESM',
    'ERR_REQUIRE_ASYNC_MODULE',
    'ERR_PACKAGE_PATH_NOT_EXPORTED'
  ] )( 'throws a friendly error when provider package cannot be loaded synchronously: %s', async code => {
    const error = Object.assign( new Error( code ), { code } );
    const { getProvider } = await importWithMockedRequire( {
      '@ai-sdk/openai': error
    } );

    expect( () => getProvider( 'openai' ) ).toThrow(
      'Provider "openai" package "@ai-sdk/openai" cannot be loaded synchronously. Use a compatible version.'
    );
  } );
} );

describe( 'registerProvider', () => {
  it( 'registers custom providers', async () => {
    const { getProvider, getProviderNames, registerProvider } = await importWithMockedRequire( {} );
    const customProvider = vi.fn();

    registerProvider( 'custom', customProvider );

    expect( getProvider( 'custom' ) ).toBe( customProvider );
    expect( getProviderNames() ).toContain( 'custom' );
  } );

  it( 'validates provider registration arguments', async () => {
    const { registerProvider } = await importWithMockedRequire( {} );

    expect( () => registerProvider( '', vi.fn() ) ).toThrow( 'Provider name must be a non-empty string' );
    expect( () => registerProvider( 'custom', 'not-a-function' ) ).toThrow( 'expected function, received string' );
  } );
} );

describe( 'getProviderNames', () => {
  it( 'returns shipped and registered provider names without duplicates', async () => {
    const { getProviderNames, registerProvider } = await importWithMockedRequire( {} );

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
