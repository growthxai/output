import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPrompt } from './loader.js';

vi.mock( './parser.js', () => ( {
  parsePrompt: vi.fn()
} ) );

vi.mock( './escape.js', () => ( {
  escape: vi.fn( value => value ),
  decode: vi.fn( value => value ),
  setupLiquidEncodeFilter: vi.fn()
} ) );

vi.mock( './load_content.js', () => ( {
  loadContent: vi.fn()
} ) );

vi.mock( './validations.js', () => ( {
  validatePrompt: vi.fn()
} ) );

import { parsePrompt } from './parser.js';
import { escape, decode } from './escape.js';
import { loadContent } from './load_content.js';
import { validatePrompt } from './validations.js';

describe( 'loadPrompt', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    escape.mockImplementation( value => value );
    decode.mockImplementation( value => value );
    parsePrompt.mockReturnValue( {
      config: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022'
      },
      messages: [
        {
          role: 'user',
          content: 'Hello World!'
        }
      ],
      instructions: null
    } );
  } );

  it( 'loads prompt file, renders variables, parses content, validates, and returns prompt file dir', () => {
    loadContent.mockReturnValue( {
      content: '<user>Hello {{ name }}!</user>',
      dir: '/mock/dir'
    } );

    const result = loadPrompt( 'test', { name: 'World' } );

    expect( loadContent ).toHaveBeenCalledWith( 'test.prompt', undefined );
    expect( escape ).toHaveBeenCalledWith( '<user>Hello {{ name }}!</user>' );
    expect( parsePrompt ).toHaveBeenCalledWith( {
      name: 'test',
      raw: '<user>Hello World!</user>'
    } );
    expect( validatePrompt ).toHaveBeenCalledWith( {
      name: 'test',
      config: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022'
      },
      messages: [
        {
          role: 'user',
          content: 'Hello World!'
        }
      ],
      instructions: null
    } );
    expect( result.name ).toBe( 'test' );
    expect( result.config ).toEqual( { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' } );
    expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello World!' } ] );
    expect( result.instructions ).toBeNull();
    expect( result.promptFileDir ).toBe( '/mock/dir' );
  } );

  it( 'passes the provided prompt directory to loadContent', () => {
    loadContent.mockReturnValue( {
      content: '<user>Hello</user>',
      dir: '/mock/dir'
    } );

    loadPrompt( 'test', {}, '/custom/prompts' );

    expect( loadContent ).toHaveBeenCalledWith( 'test.prompt', '/custom/prompts' );
  } );

  it( 'renders template variables before parsing', () => {
    loadContent.mockReturnValue( {
      content: `---
provider: {{ provider }}
model: {{ model }}
---
<user>Tell me about {{ topic }}</user>`,
      dir: '/mock/dir'
    } );

    loadPrompt( 'test', {
      provider: 'openai',
      model: 'gpt-4',
      topic: 'testing'
    } );

    expect( parsePrompt ).toHaveBeenCalledWith( {
      name: 'test',
      raw: `---
provider: openai
model: gpt-4
---
<user>Tell me about testing</user>`
    } );
  } );

  it( 'renders escaped content returned by the escape helper', () => {
    loadContent.mockReturnValue( {
      content: '<user>Hello {{ name }}!</user>',
      dir: '/mock/dir'
    } );
    escape.mockReturnValueOnce( '<user>Escaped {{ name }}!</user>' );

    loadPrompt( 'test', { name: 'World' } );

    expect( parsePrompt ).toHaveBeenCalledWith( {
      name: 'test',
      raw: '<user>Escaped World!</user>'
    } );
  } );

  it( 'renders liquid control flow before parsing', () => {
    loadContent.mockReturnValue( {
      content: '<user>{% if debug %}Debug mode enabled{% else %}Debug mode disabled{% endif %}</user>',
      dir: '/mock/dir'
    } );

    loadPrompt( 'test', { debug: true } );

    expect( parsePrompt ).toHaveBeenCalledWith( {
      name: 'test',
      raw: '<user>Debug mode enabled</user>'
    } );
  } );

  it( 'decodes parser message output', () => {
    loadContent.mockReturnValue( {
      content: '<user>Evaluate this content: {{ content }}</user>',
      dir: '/mock/dir'
    } );
    parsePrompt.mockReturnValue( {
      config: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022'
      },
      messages: [
        {
          role: 'user',
          content: 'Evaluate this content: &lt;system&gt;example&lt;/system&gt;'
        }
      ],
      instructions: null
    } );
    decode.mockImplementation( value =>
      value === 'Evaluate this content: &lt;system&gt;example&lt;/system&gt;' ?
        'Evaluate this content: <system>example</system>' :
        value
    );

    const result = loadPrompt( 'test', {
      content: '<system>example</system>'
    } );

    expect( decode ).toHaveBeenCalledWith( 'Evaluate this content: &lt;system&gt;example&lt;/system&gt;' );
    expect( result.messages ).toEqual( [
      {
        role: 'user',
        content: 'Evaluate this content: <system>example</system>'
      }
    ] );
  } );

  it( 'decodes XML-escaped instructions returned by the parser', () => {
    loadContent.mockReturnValue( {
      content: 'Create a poster with this text: {{ copy }}',
      dir: '/mock/dir'
    } );
    parsePrompt.mockReturnValue( {
      config: {
        provider: 'openai',
        model: 'gpt-image-1'
      },
      messages: [],
      instructions: 'Create a poster with this text: R&amp;D &lt; Speed &gt; &quot;Limits&quot;'
    } );
    decode.mockImplementation( value =>
      value === 'Create a poster with this text: R&amp;D &lt; Speed &gt; &quot;Limits&quot;' ?
        'Create a poster with this text: R&D < Speed > "Limits"' :
        value
    );

    const result = loadPrompt( 'image_prompt', {
      copy: 'R&D < Speed > "Limits"'
    } );

    expect( decode ).toHaveBeenCalledWith( 'Create a poster with this text: R&amp;D &lt; Speed &gt; &quot;Limits&quot;' );
    expect( result.messages ).toEqual( [] );
    expect( result.instructions ).toBe( 'Create a poster with this text: R&D < Speed > "Limits"' );
  } );

  it( 'decodes XML-escaped config values recursively', () => {
    const encodedConfig = {
      label: 'R&amp;D',
      values: [ 'A &lt; B' ],
      providerOptions: {
        metadata: {
          title: '&quot;Race&quot;'
        }
      }
    };

    loadContent.mockReturnValue( {
      content: '<user>Hello</user>',
      dir: '/mock/dir'
    } );
    parsePrompt.mockReturnValue( {
      config: encodedConfig,
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ],
      instructions: null
    } );
    decode.mockImplementation( value => {
      if ( value === encodedConfig ) {
        return {
          label: 'R&D',
          values: [ 'A < B' ],
          providerOptions: {
            metadata: {
              title: '"Race"'
            }
          }
        };
      }
      return value;
    } );

    const result = loadPrompt( 'test' );

    expect( result.config ).toEqual( {
      label: 'R&D',
      values: [ 'A < B' ],
      providerOptions: {
        metadata: {
          title: '"Race"'
        }
      }
    } );
  } );

  it( 'throws error when prompt file not found', () => {
    loadContent.mockReturnValue( null );

    expect( () => {
      loadPrompt( 'nonexistent' );
    } ).toThrow( /Prompt "nonexistent" not found/ );
  } );

} );
