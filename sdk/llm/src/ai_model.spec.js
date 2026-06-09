import { afterEach, describe, expect, it, vi } from 'vitest';

const getProvider = vi.hoisted( () => vi.fn() );

vi.mock( './ai_provider.js', () => ( {
  getProvider
} ) );

import { loadImageModel, loadTextModel, loadTools } from './ai_model.js';

afterEach( () => {
  vi.clearAllMocks();
} );

describe( 'loadTextModel', () => {
  it( 'loads a text model using the prompt provider and model', () => {
    const provider = vi.fn( model => ( { type: 'text-model', model } ) );
    getProvider.mockReturnValue( provider );

    const result = loadTextModel( {
      config: {
        provider: 'openai',
        model: 'gpt-4o-mini'
      }
    } );

    expect( getProvider ).toHaveBeenCalledWith( 'openai' );
    expect( provider ).toHaveBeenCalledWith( 'gpt-4o-mini' );
    expect( result ).toEqual( {
      type: 'text-model',
      model: 'gpt-4o-mini'
    } );
  } );

  it( 'propagates provider lookup errors', () => {
    getProvider.mockImplementation( () => {
      throw new Error( 'Unsupported provider "missing"' );
    } );

    expect( () => loadTextModel( {
      config: {
        provider: 'missing',
        model: 'model'
      }
    } ) ).toThrow( 'Unsupported provider "missing"' );
  } );
} );

describe( 'loadImageModel', () => {
  it( 'loads an image model using provider.image', () => {
    const textProvider = vi.fn();
    textProvider.image = vi.fn( model => ( { type: 'image-model', model } ) );
    getProvider.mockReturnValue( textProvider );

    const result = loadImageModel( {
      config: {
        provider: 'openai',
        model: 'gpt-image-1'
      }
    } );

    expect( getProvider ).toHaveBeenCalledWith( 'openai' );
    expect( textProvider.image ).toHaveBeenCalledWith( 'gpt-image-1' );
    expect( textProvider ).not.toHaveBeenCalled();
    expect( result ).toEqual( {
      type: 'image-model',
      model: 'gpt-image-1'
    } );
  } );

  it( 'falls back to provider.imageModel', () => {
    const provider = vi.fn();
    provider.imageModel = vi.fn( model => ( { type: 'legacy-image-model', model } ) );
    getProvider.mockReturnValue( provider );

    const result = loadImageModel( {
      config: {
        provider: 'custom',
        model: 'image-v1'
      }
    } );

    expect( provider.imageModel ).toHaveBeenCalledWith( 'image-v1' );
    expect( result ).toEqual( {
      type: 'legacy-image-model',
      model: 'image-v1'
    } );
  } );

  it( 'prefers provider.image when both image factories exist', () => {
    const provider = vi.fn();
    provider.image = vi.fn( model => ( { type: 'image', model } ) );
    provider.imageModel = vi.fn( model => ( { type: 'imageModel', model } ) );
    getProvider.mockReturnValue( provider );

    const result = loadImageModel( {
      config: {
        provider: 'custom',
        model: 'image-v1'
      }
    } );

    expect( provider.image ).toHaveBeenCalledWith( 'image-v1' );
    expect( provider.imageModel ).not.toHaveBeenCalled();
    expect( result.type ).toBe( 'image' );
  } );

  it( 'throws a clear error when the provider does not support image models', () => {
    getProvider.mockReturnValue( vi.fn() );

    expect( () => loadImageModel( {
      config: {
        provider: 'azure',
        model: 'gpt-image-1'
      }
    } ) ).toThrow( 'Provider "azure" does not support image models.' );
  } );
} );

describe( 'loadTools', () => {
  it( 'returns null and does not load the provider when no tools are configured', () => {
    const result = loadTools( {
      config: {
        provider: 'vertex',
        model: 'gemini-2.0-flash'
      }
    } );

    expect( result ).toBeNull();
    expect( getProvider ).not.toHaveBeenCalled();
  } );

  it( 'returns null and does not load the provider when tools config is empty', () => {
    const result = loadTools( {
      config: {
        provider: 'vertex',
        tools: {}
      }
    } );

    expect( result ).toBeNull();
    expect( getProvider ).not.toHaveBeenCalled();
  } );

  it( 'throws when the provider has no tools object', () => {
    getProvider.mockReturnValue( vi.fn() );

    expect( () => loadTools( {
      config: {
        provider: 'azure',
        tools: {
          webSearch: {}
        }
      }
    } ) ).toThrow( 'Provider "azure" does not support provider-specific tools.' );
  } );

  it( 'loads a single provider tool with config', () => {
    const googleSearch = vi.fn( config => ( { type: 'googleSearch', config } ) );
    const provider = {
      tools: {
        googleSearch
      }
    };
    getProvider.mockReturnValue( provider );

    const result = loadTools( {
      config: {
        provider: 'vertex',
        tools: {
          googleSearch: {
            mode: 'MODE_DYNAMIC',
            dynamicThreshold: 0.8
          }
        }
      }
    } );

    expect( getProvider ).toHaveBeenCalledWith( 'vertex' );
    expect( googleSearch ).toHaveBeenCalledWith( {
      mode: 'MODE_DYNAMIC',
      dynamicThreshold: 0.8
    } );
    expect( result ).toEqual( {
      googleSearch: {
        type: 'googleSearch',
        config: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 0.8
        }
      }
    } );
  } );

  it( 'loads multiple provider tools', () => {
    const googleSearch = vi.fn( config => ( { type: 'googleSearch', config } ) );
    const urlContext = vi.fn( config => ( { type: 'urlContext', config } ) );
    getProvider.mockReturnValue( {
      tools: {
        googleSearch,
        urlContext
      }
    } );

    const result = loadTools( {
      config: {
        provider: 'vertex',
        tools: {
          googleSearch: {
            mode: 'MODE_DYNAMIC'
          },
          urlContext: {}
        }
      }
    } );

    expect( Object.keys( result ) ).toEqual( [ 'googleSearch', 'urlContext' ] );
    expect( googleSearch ).toHaveBeenCalledWith( { mode: 'MODE_DYNAMIC' } );
    expect( urlContext ).toHaveBeenCalledWith( {} );
    expect( result.googleSearch.type ).toBe( 'googleSearch' );
    expect( result.urlContext.type ).toBe( 'urlContext' );
  } );

  it( 'throws when a configured tool is not supported by the provider', () => {
    getProvider.mockReturnValue( {
      tools: {
        googleSearch: vi.fn(),
        urlContext: vi.fn()
      }
    } );

    expect( () => loadTools( {
      config: {
        provider: 'vertex',
        tools: {
          unknownTool: {}
        }
      }
    } ) ).toThrow( 'Invalid tool(s) unknownTool for provider "vertex". Available: googleSearch, urlContext.' );
  } );

  it( 'reports all unsupported configured tools', () => {
    getProvider.mockReturnValue( {
      tools: {
        googleSearch: vi.fn()
      }
    } );

    expect( () => loadTools( {
      config: {
        provider: 'vertex',
        tools: {
          unknownTool: {},
          anotherUnknownTool: {}
        }
      }
    } ) ).toThrow( 'Invalid tool(s) unknownTool, anotherUnknownTool for provider "vertex". Available: googleSearch.' );
  } );
} );
