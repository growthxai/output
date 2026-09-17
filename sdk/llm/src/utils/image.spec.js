import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted( () => ( {
  logger: { error: vi.fn() }
} ) );

vi.mock( '@outputai/core', () => ( {
  Logger: mocks.logger
} ) );

import { calculateBase64FileSize, serializeImagesFromResponse } from './image.js';

describe( 'calculateBase64FileSize', () => {
  it( 'calculates size for base64 without padding', () => {
    expect( calculateBase64FileSize( 'TWFu' ) ).toBe( 3 );
  } );

  it( 'calculates size for base64 with one padding character', () => {
    expect( calculateBase64FileSize( 'TWE=' ) ).toBe( 2 );
  } );

  it( 'calculates size for base64 with two padding characters', () => {
    expect( calculateBase64FileSize( 'TQ==' ) ).toBe( 1 );
  } );

  it( 'returns zero for an empty string', () => {
    expect( calculateBase64FileSize( '' ) ).toBe( 0 );
  } );

  it( 'returns null when the value is not a string', () => {
    expect( calculateBase64FileSize( undefined ) ).toBeNull();
    expect( calculateBase64FileSize( null ) ).toBeNull();
    expect( calculateBase64FileSize( 42 ) ).toBeNull();
  } );
} );

/** Stands in for the SDK `GeneratedFile`, which exposes `base64` as a lazy getter on the prototype */
class GeneratedFile {
  constructor( { base64, mediaType } ) {
    this.mediaType = mediaType;
    this.data = base64;
  }

  get base64() {
    return this.data;
  }
}

describe( 'serializeImagesFromResponse', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'maps every image to its size and media type', () => {
    const response = {
      images: [
        { base64: 'TWFu', mediaType: 'image/png' },
        { base64: 'TQ==', mediaType: 'image/webp' }
      ]
    };

    expect( serializeImagesFromResponse( response ) ).toEqual( [
      { size: 3, mediaType: 'image/png' },
      { size: 1, mediaType: 'image/webp' }
    ] );
  } );

  it( 'reads base64 from a prototype getter', () => {
    const response = { images: [ new GeneratedFile( { base64: 'TWFu', mediaType: 'image/png' } ) ] };

    expect( serializeImagesFromResponse( response ) ).toEqual( [ { size: 3, mediaType: 'image/png' } ] );
  } );

  it( 'returns empty when images are missing or not an array', () => {
    expect( serializeImagesFromResponse( undefined ) ).toEqual( [] );
    expect( serializeImagesFromResponse( {} ) ).toEqual( [] );
    expect( serializeImagesFromResponse( { images: null } ) ).toEqual( [] );
    expect( serializeImagesFromResponse( { images: 'TWFu' } ) ).toEqual( [] );
    expect( serializeImagesFromResponse( { images: [] } ) ).toEqual( [] );
  } );

  it( 'skips entries that are not objects', () => {
    const response = { images: [ null, undefined, 'TWFu', 42, { base64: 'TWFu', mediaType: 'image/png' } ] };

    expect( serializeImagesFromResponse( response ) ).toEqual( [ { size: 3, mediaType: 'image/png' } ] );
  } );

  it( 'reports a null size when base64 is missing', () => {
    const response = { images: [ { mediaType: 'image/png' } ] };

    expect( serializeImagesFromResponse( response ) ).toEqual( [ { size: null, mediaType: 'image/png' } ] );
  } );

  it( 'logs and returns empty when reading an image throws', () => {
    const response = {
      images: [ {
        mediaType: 'image/png',
        get base64() {
          throw new Error( 'base64 exploded' );
        }
      } ]
    };

    expect( serializeImagesFromResponse( response ) ).toEqual( [] );
    expect( mocks.logger.error ).toHaveBeenCalledWith(
      'Image serialization failed',
      expect.objectContaining( { namespace: 'LLM', error: 'base64 exploded' } )
    );
  } );

  it( 'logs and returns empty when reading the response images throws', () => {
    const response = {
      get images() {
        throw new Error( 'images exploded' );
      }
    };

    expect( serializeImagesFromResponse( response ) ).toEqual( [] );
    expect( mocks.logger.error ).toHaveBeenCalledOnce();
  } );
} );
