import { describe, it, expect } from 'vitest';
import { ValidationError } from '@outputai/core';
import { validateGenerateTextArgs, validateStreamTextArgs } from './validations.js';

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
