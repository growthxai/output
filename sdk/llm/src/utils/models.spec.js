import { afterEach, describe, expect, it, vi } from 'vitest';

const getProvider = vi.hoisted( () => vi.fn() );

vi.mock( '../ai_provider.js', () => ( {
  getProvider
} ) );

import { loadImageModel, loadTextModel } from './models.js';

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
      name: 'foo',
      config: {
        provider: 'azure',
        model: 'gpt-image-1'
      }
    } ) ).toThrow( 'Provider "azure" used by prompt "foo" does not support image models.' );
  } );
} );
