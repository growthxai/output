import { describe, it, expect } from 'vitest';
import { ValidationError } from '@outputai/core';
import { validateGenerateTextArgs, validateStreamTextArgs, validateGenerateImageArgs } from './validations.js';

describe( 'validateGenerateTextArgs', () => {
  it( 'accepts a prompt with optional variables', () => {
    expect( () => validateGenerateTextArgs( {
      prompt: 'summary@v1',
      variables: { topic: 'testing' },
      promptDir: '/prompts',
      skills: [ { name: 'style', description: 'Style', instructions: '# Style' } ],
      maxSteps: 4
    } ) ).not.toThrow();
  } );

  it( 'accepts a dynamic skills function', () => {
    expect( () => validateGenerateTextArgs( {
      prompt: 'summary@v1',
      skills: () => [ { name: 'style', description: 'Style', instructions: '# Style' } ]
    } ) ).not.toThrow();
  } );

  it( 'throws ValidationError with generateText prefix for invalid args', () => {
    expect( () => validateGenerateTextArgs( {
      variables: { topic: 'testing' }
    } ) ).toThrow( ValidationError );

    expect( () => validateGenerateTextArgs( {
      prompt: 123
    } ) ).toThrow( /Invalid generateText\(\) arguments/ );
  } );

  it( 'throws ValidationError for invalid promptDir, skills, or maxSteps', () => {
    expect( () => validateGenerateTextArgs( {
      prompt: 'summary@v1',
      promptDir: ''
    } ) ).toThrow( ValidationError );

    expect( () => validateGenerateTextArgs( {
      prompt: 'summary@v1',
      skills: [ { name: '', description: 'Style', instructions: '# Style' } ]
    } ) ).toThrow( ValidationError );

    expect( () => validateGenerateTextArgs( {
      prompt: 'summary@v1',
      maxSteps: 0
    } ) ).toThrow( ValidationError );
  } );
} );

describe( 'validateStreamTextArgs', () => {
  it( 'accepts a prompt with optional variables', () => {
    expect( () => validateStreamTextArgs( {
      prompt: 'summary@v1',
      variables: [ 'arrays are accepted by the current schema' ],
      promptDir: '/prompts',
      skills: [ { name: 'style', description: 'Style', instructions: '# Style' } ],
      maxSteps: 4
    } ) ).not.toThrow();
  } );

  it( 'accepts a dynamic skills function', () => {
    expect( () => validateStreamTextArgs( {
      prompt: 'summary@v1',
      skills: () => [ { name: 'style', description: 'Style', instructions: '# Style' } ]
    } ) ).not.toThrow();
  } );

  it( 'throws ValidationError with streamText prefix for invalid args', () => {
    expect( () => validateStreamTextArgs( {} ) ).toThrow( ValidationError );
    expect( () => validateStreamTextArgs( { prompt: null } ) ).toThrow( /Invalid streamText\(\) arguments/ );
  } );

  it( 'throws ValidationError for invalid promptDir, skills, or maxSteps', () => {
    expect( () => validateStreamTextArgs( {
      prompt: 'summary@v1',
      promptDir: ''
    } ) ).toThrow( ValidationError );

    expect( () => validateStreamTextArgs( {
      prompt: 'summary@v1',
      skills: [ { name: 'style', description: 'Style', instructions: '' } ]
    } ) ).toThrow( ValidationError );

    expect( () => validateStreamTextArgs( {
      prompt: 'summary@v1',
      maxSteps: 1.5
    } ) ).toThrow( ValidationError );
  } );
} );

describe( 'validateGenerateImageArgs', () => {
  it( 'accepts text-to-image args without images or mask', () => {
    expect( () => validateGenerateImageArgs( {
      prompt: 'image@v1',
      variables: { topic: 'race cars' },
      promptDir: '/prompts'
    } ) ).not.toThrow();
  } );

  it( 'accepts all supported image input shapes', () => {
    const buffer = Buffer.from( 'image-bytes' );
    const uint8Array = new Uint8Array( [ 1, 2, 3 ] );
    const arrayBuffer = new ArrayBuffer( 3 );
    const base64 = 'aW1hZ2UtYnl0ZXM=';

    expect( () => validateGenerateImageArgs( {
      prompt: 'image@v1',
      images: [
        buffer,
        uint8Array,
        arrayBuffer,
        base64,
        { data: buffer, mediaType: 'image/png' },
        { data: uint8Array },
        { data: arrayBuffer, mediaType: 'image/jpeg' },
        { data: base64, mediaType: 'image/webp' }
      ],
      mask: { data: Buffer.from( 'mask-bytes' ), mediaType: 'image/png' }
    } ) ).not.toThrow();
  } );

  it( 'throws ValidationError for invalid image args', () => {
    expect( () => validateGenerateImageArgs( {
      prompt: ''
    } ) ).toThrow( /Invalid generateImage\(\) arguments/ );

    expect( () => validateGenerateImageArgs( {
      prompt: 'image@v1',
      images: []
    } ) ).toThrow( ValidationError );

    expect( () => validateGenerateImageArgs( {
      prompt: 'image@v1',
      images: [ { data: null } ]
    } ) ).toThrow( ValidationError );

    expect( () => validateGenerateImageArgs( {
      prompt: 'image@v1',
      images: [ { data: 'aW1hZ2U=', mediaType: '' } ]
    } ) ).toThrow( ValidationError );
  } );

  it( 'requires images when mask is provided', () => {
    expect( () => validateGenerateImageArgs( {
      prompt: 'image@v1',
      mask: Buffer.from( 'mask-bytes' )
    } ) ).toThrow( /mask requires images/ );
  } );
} );
