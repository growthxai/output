import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@outputai/core';

const liquidMocks = vi.hoisted( () => ( {
  parseAndRenderSync: vi.fn(),
  registerFilter: vi.fn()
} ) );

vi.mock( 'liquidjs', () => ( {
  Liquid: class Liquid {
    parseAndRenderSync = liquidMocks.parseAndRenderSync;
    registerFilter = liquidMocks.registerFilter;
  }
} ) );

vi.mock( 'gray-matter', () => ( {
  default: vi.fn()
} ) );

vi.mock( '@outputai/core/sdk/helpers', () => ( {
  Path: {
    resolveInvocationDir: vi.fn( () => '/invocation' )
  }
} ) );

vi.mock( './interpolations.js', () => ( {
  pipeInterpolations: vi.fn( value => value ),
  interpolationFilterToken: '__var_safe',
  encode: vi.fn()
} ) );

vi.mock( '../utils/file.js', () => ( {
  searchAndReadFile: vi.fn()
} ) );

vi.mock( './content.js', () => ( {
  parseContent: vi.fn()
} ) );

vi.mock( './validations.js', () => ( {
  parsePromptSchema: vi.fn( prompt => prompt )
} ) );

import { loadPrompt } from './loader.js';
import { Path } from '@outputai/core/sdk/helpers';
import matter from 'gray-matter';
import { pipeInterpolations } from './interpolations.js';
import { searchAndReadFile } from '../utils/file.js';
import { parseContent } from './content.js';
import { parsePromptSchema } from './validations.js';

const defaultConfig = {
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022'
};

const defaultParsed = {
  messages: [ { role: 'user', content: 'Hi' } ],
  instructions: null
};

const stubMatter = ( config = defaultConfig ) => {
  matter.mockImplementation( ( _input, options ) => {
    if ( options?.engines ) {
      return { matter: 'RAW_YAML', content: 'RAW_BODY' };
    }
    return { data: { ...config } };
  } );
};

describe( 'loadPrompt', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    Path.resolveInvocationDir.mockReturnValue( '/invocation' );
    searchAndReadFile.mockReturnValue( { content: 'FILE', dir: '/mock/dir' } );
    pipeInterpolations.mockImplementation( value => value );
    liquidMocks.parseAndRenderSync.mockImplementation( template => template );
    parseContent.mockReturnValue( { ...defaultParsed, messages: [ ...defaultParsed.messages ] } );
    parsePromptSchema.mockImplementation( prompt => prompt );
    stubMatter();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'splits, renders, parses, and validates the prompt', () => {
    const variables = { name: 'World' };

    const result = loadPrompt( 'test', variables );

    expect( searchAndReadFile ).toHaveBeenCalledWith( '/invocation', 'test.prompt' );
    expect( matter ).toHaveBeenNthCalledWith( 1, 'FILE', expect.objectContaining( {
      engines: { yaml: expect.any( Function ) }
    } ) );
    expect( pipeInterpolations ).toHaveBeenCalledWith( 'RAW_BODY' );
    expect( liquidMocks.parseAndRenderSync ).toHaveBeenNthCalledWith( 1, 'RAW_BODY', variables );
    expect( liquidMocks.parseAndRenderSync ).toHaveBeenNthCalledWith( 2, 'RAW_YAML', variables );
    expect( matter ).toHaveBeenNthCalledWith( 2, '---\nRAW_YAML\n---\n' );
    expect( parseContent ).toHaveBeenCalledWith( 'RAW_BODY', undefined );
    expect( parsePromptSchema ).toHaveBeenCalledWith( {
      name: 'test',
      config: defaultConfig,
      messages: defaultParsed.messages,
      instructions: null,
      fileDir: '/mock/dir',
      variables
    } );
    expect( result ).toEqual( parsePromptSchema.mock.calls[0][0] );
  } );

  it( 'passes the provided prompt directory to searchAndReadFile', () => {
    loadPrompt( 'test', {}, '/custom/prompts' );

    expect( searchAndReadFile ).toHaveBeenCalledWith( '/custom/prompts', 'test.prompt' );
    expect( Path.resolveInvocationDir ).not.toHaveBeenCalled();
  } );

  it( 'renders the piped template, not the raw body', () => {
    pipeInterpolations.mockReturnValue( 'PIPED' );

    loadPrompt( 'test', { name: 'World' } );

    expect( liquidMocks.parseAndRenderSync ).toHaveBeenNthCalledWith( 1, 'PIPED', { name: 'World' } );
    expect( parseContent ).toHaveBeenCalledWith( 'PIPED', undefined );
  } );

  it( 'passes config.messageOptions to parseContent', () => {
    const messageOptions = { cached: { anthropic: { cacheControl: { type: 'ephemeral' } } } };
    stubMatter( { ...defaultConfig, messageOptions } );

    loadPrompt( 'test' );

    expect( parseContent ).toHaveBeenCalledWith( 'RAW_BODY', messageOptions );
  } );

  it( 'uses parseContent for messages and instructions', () => {
    parseContent.mockReturnValue( {
      messages: [],
      instructions: 'Generate a poster.'
    } );

    const result = loadPrompt( 'image_prompt' );

    expect( result.messages ).toEqual( [] );
    expect( result.instructions ).toBe( 'Generate a poster.' );
  } );

  it.each( [
    [ 'vertex', 'google-vertex' ],
    [ 'bedrock', 'amazon-bedrock' ]
  ] )( 'rewrites deprecated provider alias %s to %s and warns', ( alias, canonical ) => {
    const warn = vi.spyOn( Logger, 'warn' ).mockImplementation( () => {} );
    stubMatter( { provider: alias, model: 'test-model' } );

    const result = loadPrompt( 'test' );

    expect( result.config.provider ).toBe( canonical );
    expect( parsePromptSchema ).toHaveBeenCalledWith( expect.objectContaining( {
      config: expect.objectContaining( { provider: canonical } )
    } ) );
    expect( warn ).toHaveBeenCalledWith(
      `Using deprecated provider alias "${alias}". Use "${canonical}" instead.`,
      { namespace: 'LLM' }
    );
  } );

  it( 'leaves canonical provider names unchanged', () => {
    const warn = vi.spyOn( Logger, 'warn' ).mockImplementation( () => {} );
    stubMatter( { provider: 'google-vertex', model: 'gemini-2.5-flash-lite' } );

    const result = loadPrompt( 'test' );

    expect( result.config.provider ).toBe( 'google-vertex' );
    expect( warn ).not.toHaveBeenCalled();
  } );

  it( 'throws when the prompt file is not found', () => {
    searchAndReadFile.mockReturnValue( null );

    expect( () => loadPrompt( 'nonexistent' ) ).toThrow( /Prompt file "nonexistent" not found/ );
  } );

  it( 'throws when rendered content is empty', () => {
    liquidMocks.parseAndRenderSync.mockReturnValueOnce( '  ' );

    expect( () => loadPrompt( 'empty_prompt' ) ).toThrow( /Prompt "empty_prompt" has no content/ );
  } );

  it( 'wraps split errors with the prompt name', () => {
    matter.mockImplementation( () => {
      throw new Error( 'bad delimiters' );
    } );

    expect( () => loadPrompt( 'writer@v1' ) ).toThrow(
      /Error parsing frontmatter on prompt "writer@v1": bad delimiters/
    );
  } );

  it( 'wraps content render errors with the prompt name', () => {
    liquidMocks.parseAndRenderSync.mockImplementation( () => {
      throw new Error( 'unknown variable' );
    } );

    expect( () => loadPrompt( 'writer@v1' ) ).toThrow(
      /Error rendering content on prompt "writer@v1": unknown variable/
    );
  } );

  it( 'wraps frontmatter render errors with the prompt name', () => {
    liquidMocks.parseAndRenderSync
      .mockReturnValueOnce( 'BODY' )
      .mockImplementationOnce( () => {
        throw new Error( 'unknown filter' );
      } );

    expect( () => loadPrompt( 'writer@v1' ) ).toThrow(
      /Error rendering frontmatter on prompt "writer@v1": unknown filter/
    );
  } );

  it( 'wraps frontmatter yaml parse errors with the prompt name', () => {
    matter.mockImplementation( ( _input, options ) => {
      if ( options?.engines ) {
        return { matter: 'RAW_YAML', content: 'RAW_BODY' };
      }
      throw new Error( 'invalid yaml' );
    } );

    expect( () => loadPrompt( 'writer@v1' ) ).toThrow(
      /Error converting frontmatter yaml to js on prompt "writer@v1": invalid yaml/
    );
  } );

  it( 'wraps content parse errors with the prompt name', () => {
    parseContent.mockImplementation( () => {
      throw new Error( 'unknown option' );
    } );

    expect( () => loadPrompt( 'writer@v1' ) ).toThrow(
      /Error parsing content on prompt "writer@v1": unknown option/
    );
  } );
} );
