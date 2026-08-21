import { describe, it, expect } from 'vitest';
import { ValidationError } from '@outputai/core';
import {
  parseGenerateTextArgs,
  parseGenerateTextWithStreamingArgs,
  parseStreamTextArgs,
  parseGenerateImageArgs,
  parseAgentArgs,
  parseAgentGenerateArgs,
  parseAgentGenerateWithStreamingArgs,
  parseAgentStreamArgs
} from './validations.js';

const makeOutput = () => ( { name: 'object' } );

const searchTool = { description: 'Search' };
const stopWhen = () => false;

describe( 'parseGenerateTextArgs', () => {
  it( 'renames prompt to promptFile and keeps allowlisted leftovers', () => {
    const abortSignal = AbortSignal.abort();
    const tools = { search: searchTool };
    const output = makeOutput();

    expect( parseGenerateTextArgs( {
      prompt: 'summary@v1',
      variables: { topic: 'testing', count: 2, draft: false },
      promptDir: '/prompts',
      tools,
      output,
      toolChoice: { type: 'tool', toolName: 'search' },
      stopWhen,
      abortSignal
    } ) ).toEqual( {
      promptFile: 'summary@v1',
      variables: { topic: 'testing', count: 2, draft: false },
      promptDir: '/prompts',
      tools,
      output,
      toolChoice: { type: 'tool', toolName: 'search' },
      stopWhen,
      abortSignal
    } );
  } );

  it( 'accepts an array of stopWhen functions', () => {
    const parsed = parseGenerateTextArgs( {
      prompt: 'summary@v1',
      stopWhen: [ stopWhen ]
    } );

    expect( parsed.stopWhen ).toEqual( [ stopWhen ] );
  } );

  it( 'throws ValidationError with generateText prefix for invalid args', () => {
    expect( () => parseGenerateTextArgs( {
      variables: { topic: 'testing' }
    } ) ).toThrow( ValidationError );

    expect( () => parseGenerateTextArgs( {
      prompt: 123
    } ) ).toThrow( /Invalid generateText\(\) arguments/ );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      promptDir: ''
    } ) ).toThrow( ValidationError );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      abortSignal: {}
    } ) ).toThrow( ValidationError );
  } );

  it( 'does not keep prompt-owned call arguments on the parsed result', () => {
    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      skills: [ { name: 'style', description: 'Style', instructions: '# Style' } ]
    } ) ).toThrow( /skills must be set in the prompt file/ );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      maxSteps: 4,
      skills: [ './writer.md' ]
    } ) ).toThrow( /must be set in the prompt file/ );
  } );

  it( 'throws ValidationError for unrecognized call arguments', () => {
    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      temperature: 0.2
    } ) ).toThrow( /unrecognized key/i );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      maxRetries: 2
    } ) ).toThrow( /unrecognized key/i );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      onChunk: () => {}
    } ) ).toThrow( /unrecognized key/i );
  } );

  it( 'accepts nested objects and arrays as variables', () => {
    const variables = {
      company: { name: 'Acme', industries: [ 'SaaS', 'AI' ] },
      criteria: [ { name: 'Accuracy', required: true } ]
    };

    expect( parseGenerateTextArgs( {
      prompt: 'summary@v1',
      variables
    } ).variables ).toEqual( variables );
  } );

  it( 'throws ValidationError for invalid allowlisted field shapes', () => {
    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      variables: [ 'not a record' ]
    } ) ).toThrow( ValidationError );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      tools: { search: true }
    } ) ).toThrow( ValidationError );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      output: true
    } ) ).toThrow( ValidationError );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      stopWhen: { type: 'custom-stop' }
    } ) ).toThrow( ValidationError );

    expect( () => parseGenerateTextArgs( {
      prompt: 'summary@v1',
      toolChoice: 'maybe'
    } ) ).toThrow( ValidationError );
  } );

  it( 'accepts opaque tools and output objects', () => {
    expect( parseGenerateTextArgs( {
      prompt: 'summary@v1',
      tools: { search: { description: 'Search' } },
      output: { type: 'object' }
    } ) ).toMatchObject( {
      tools: { search: { description: 'Search' } },
      output: { type: 'object' }
    } );
  } );
} );

describe( 'parseStreamTextArgs', () => {
  it( 'keeps stream callbacks on the parsed result', () => {
    const parsed = parseStreamTextArgs( {
      prompt: 'summary@v1',
      variables: { topic: 'testing' },
      promptDir: '/prompts',
      onFinish: () => {},
      onError: () => {},
      onChunk: () => {}
    } );

    expect( parsed.promptFile ).toBe( 'summary@v1' );
    expect( parsed.variables ).toEqual( { topic: 'testing' } );
    expect( parsed.promptDir ).toBe( '/prompts' );
    expect( parsed.onFinish ).toBeTypeOf( 'function' );
    expect( parsed.onError ).toBeTypeOf( 'function' );
    expect( parsed.onChunk ).toBeTypeOf( 'function' );
  } );

  it( 'throws ValidationError with streamText prefix for invalid args', () => {
    expect( () => parseStreamTextArgs( {} ) ).toThrow( ValidationError );
    expect( () => parseStreamTextArgs( { prompt: null } ) ).toThrow( /Invalid streamText\(\) arguments/ );

    expect( () => parseStreamTextArgs( {
      prompt: 'summary@v1',
      promptDir: ''
    } ) ).toThrow( ValidationError );
  } );

  it( 'throws ValidationError for invalid callbacks', () => {
    expect( () => parseStreamTextArgs( {
      prompt: 'summary@v1',
      onFinish: 'not a function'
    } ) ).toThrow( ValidationError );

    expect( () => parseStreamTextArgs( {
      prompt: 'summary@v1',
      onError: {}
    } ) ).toThrow( ValidationError );

    expect( () => parseStreamTextArgs( {
      prompt: 'summary@v1',
      onChunk: 'not a function'
    } ) ).toThrow( ValidationError );
  } );

  it( 'throws ValidationError for unrecognized or prompt-owned call arguments', () => {
    expect( () => parseStreamTextArgs( {
      prompt: 'summary@v1',
      temperature: 0.2
    } ) ).toThrow( /unrecognized key/i );

    expect( () => parseStreamTextArgs( {
      prompt: 'summary@v1',
      skills: [ { name: 'style', description: 'Style', instructions: '# Style' } ]
    } ) ).toThrow( /skills must be set in the prompt file/ );

    expect( () => parseStreamTextArgs( {
      prompt: 'summary@v1',
      maxSteps: 1.5
    } ) ).toThrow( /maxSteps must be set in the prompt file/ );
  } );
} );

describe( 'parseGenerateTextWithStreamingArgs', () => {
  it( 'keeps onChunk and omits streamText-only callbacks', () => {
    const parsed = parseGenerateTextWithStreamingArgs( {
      prompt: 'summary@v1',
      onChunk: () => {}
    } );

    expect( parsed.promptFile ).toBe( 'summary@v1' );
    expect( parsed.onChunk ).toBeTypeOf( 'function' );

    expect( () => parseGenerateTextWithStreamingArgs( {
      prompt: 'summary@v1',
      onFinish: () => {}
    } ) ).toThrow( /unrecognized key/i );
  } );

  it( 'uses the generateTextWithStreaming error prefix', () => {
    expect( () => parseGenerateTextWithStreamingArgs( {
      prompt: 'summary@v1',
      maxSteps: 0
    } ) ).toThrow( /Invalid generateTextWithStreaming\(\) arguments[\s\S]*maxSteps must be set in the prompt file/ );
  } );
} );

describe( 'parseGenerateImageArgs', () => {
  it( 'renames prompt to promptFile and keeps allowlisted leftovers', () => {
    const images = [ Buffer.from( 'image-bytes' ) ];
    const mask = Buffer.from( 'mask-bytes' );
    const abortSignal = AbortSignal.abort();

    expect( parseGenerateImageArgs( {
      prompt: 'image@v1',
      variables: { scene: 'race cars' },
      promptDir: '/prompts',
      images,
      mask,
      abortSignal
    } ) ).toEqual( {
      promptFile: 'image@v1',
      variables: { scene: 'race cars' },
      promptDir: '/prompts',
      images,
      mask,
      abortSignal
    } );
  } );

  it( 'accepts text-to-image args without images or mask', () => {
    expect( parseGenerateImageArgs( {
      prompt: 'image@v1',
      variables: { topic: 'race cars' },
      promptDir: '/prompts'
    } ) ).toEqual( {
      promptFile: 'image@v1',
      variables: { topic: 'race cars' },
      promptDir: '/prompts'
    } );
  } );

  it( 'accepts all supported image input shapes', () => {
    const buffer = Buffer.from( 'image-bytes' );
    const uint8Array = new Uint8Array( [ 1, 2, 3 ] );
    const arrayBuffer = new ArrayBuffer( 3 );
    const paddedBase64 = 'aW1hZ2UtYnl0ZXM=';
    const unpaddedBase64 = 'aW1hZ2U';

    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      images: [
        buffer,
        uint8Array,
        arrayBuffer,
        paddedBase64,
        unpaddedBase64,
        { data: buffer, mediaType: 'image/png' },
        { data: uint8Array },
        { data: arrayBuffer, mediaType: 'image/jpeg' },
        { data: paddedBase64, mediaType: 'image/webp' }
      ],
      mask: { data: Buffer.from( 'mask-bytes' ), mediaType: 'image/png' }
    } ) ).not.toThrow();
  } );

  it( 'throws ValidationError for invalid image args', () => {
    expect( () => parseGenerateImageArgs( {
      prompt: ''
    } ) ).toThrow( /Invalid generateImage\(\) arguments/ );

    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      images: []
    } ) ).toThrow( ValidationError );

    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      images: [ { data: null } ]
    } ) ).toThrow( ValidationError );

    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      images: [ { data: 'aW1hZ2U=', mediaType: '' } ]
    } ) ).toThrow( ValidationError );
  } );

  it( 'rejects image strings that are not raw base64 data', () => {
    for ( const image of [
      'https://example.com/image.png',
      'data:image/png;base64,aW1hZ2U=',
      'not base64',
      'abcde'
    ] ) {
      expect( () => parseGenerateImageArgs( {
        prompt: 'image@v1',
        images: [ image ]
      } ) ).toThrow( /Image strings must be raw base64 data/ );
    }
  } );

  it( 'requires images when mask is provided', () => {
    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      mask: Buffer.from( 'mask-bytes' )
    } ) ).toThrow( /mask requires images/ );
  } );

  it( 'throws ValidationError for unrecognized or prompt-owned call arguments', () => {
    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      size: '1024x1024',
      n: 2
    } ) ).toThrow( /unrecognized key/i );

    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      aspectRatio: '1:1'
    } ) ).toThrow( /unrecognized key/i );

    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      providerOptions: { openai: { quality: 'high' } }
    } ) ).toThrow( /unrecognized key/i );

    expect( () => parseGenerateImageArgs( {
      prompt: 'image@v1',
      maxSteps: 4
    } ) ).toThrow( /maxSteps must be set in the prompt file/ );
  } );
} );

describe( 'parseAgentArgs', () => {
  it( 'renames prompt to promptFile and keeps allowlisted leftovers', () => {
    const tools = { search: searchTool };
    const output = makeOutput();
    const messageStore = { getMessages() {}, addMessages() {} };

    const parsed = parseAgentArgs( {
      prompt: 'summary@v1',
      variables: { topic: 'testing' },
      promptDir: '/prompts',
      tools,
      output,
      stopWhen,
      messageStore
    } );

    expect( parsed ).toEqual( {
      promptFile: 'summary@v1',
      variables: { topic: 'testing' },
      promptDir: '/prompts',
      tools,
      output,
      stopWhen,
      messageStore
    } );
    expect( parsed.messageStore ).toBe( messageStore );
  } );

  it( 'preserves class-based message store identity', () => {
    class TestMessageStore {
      #messages = [];

      getMessages() {
        return this.#messages;
      }

      addMessages( messages ) {
        this.#messages.push( ...messages );
      }
    }

    const messageStore = new TestMessageStore();
    const parsed = parseAgentArgs( {
      prompt: 'summary@v1',
      messageStore
    } );
    const message = { role: 'user', content: 'Hello' };

    parsed.messageStore.addMessages( [ message ] );

    expect( parsed.messageStore ).toBe( messageStore );
    expect( parsed.messageStore.getMessages() ).toEqual( [ message ] );
  } );

  it( 'throws ValidationError with Agent prefix for invalid args', () => {
    expect( () => parseAgentArgs( {} ) ).toThrow( ValidationError );
    expect( () => parseAgentArgs( { prompt: '' } ) ).toThrow( /Invalid Agent\(\) arguments/ );

    expect( () => parseAgentArgs( {
      prompt: 'summary@v1',
      promptDir: ''
    } ) ).toThrow( ValidationError );
  } );

  it( 'does not keep prompt-owned call arguments on the parsed result', () => {
    expect( () => parseAgentArgs( {
      prompt: 'summary@v1',
      skills: [ { name: 'style', description: 'Style', instructions: '# Style' } ]
    } ) ).toThrow( /skills must be set in the prompt file/ );

    expect( () => parseAgentArgs( {
      prompt: 'summary@v1',
      maxSteps: 4,
      skills: [ './writer.md' ]
    } ) ).toThrow( /must be set in the prompt file/ );
  } );

  it( 'throws ValidationError for unrecognized constructor arguments', () => {
    expect( () => parseAgentArgs( {
      prompt: 'summary@v1',
      temperature: 0.2
    } ) ).toThrow( /unrecognized key/i );
  } );

  it( 'throws ValidationError for an invalid message store', () => {
    expect( () => parseAgentArgs( {
      prompt: 'summary@v1',
      messageStore: { getMessages() {} }
    } ) ).toThrow( ValidationError );
  } );
} );

describe( 'parseAgentGenerateArgs', () => {
  it( 'defaults omitted args and messages to an empty list', () => {
    expect( parseAgentGenerateArgs() ).toEqual( { messages: [] } );
    expect( parseAgentGenerateArgs( undefined ) ).toEqual( { messages: [] } );
    expect( parseAgentGenerateArgs( {} ) ).toEqual( { messages: [] } );
  } );

  it( 'keeps allowlisted generate options', () => {
    const messages = [ { role: 'user', content: 'Hello' } ];
    const abortSignal = AbortSignal.abort();

    expect( parseAgentGenerateArgs( {
      messages,
      abortSignal,
      toolChoice: 'required'
    } ) ).toEqual( {
      messages,
      abortSignal,
      toolChoice: 'required'
    } );
  } );

  it( 'throws ValidationError for unrecognized or prompt-owned call arguments', () => {
    expect( () => parseAgentGenerateArgs( { temperature: 0.2 } ) ).toThrow( /unrecognized key/i );
    expect( () => parseAgentGenerateArgs( { onChunk: () => {} } ) ).toThrow( /unrecognized key/i );
    expect( () => parseAgentGenerateArgs( { maxSteps: 4 } ) ).toThrow( /maxSteps must be set in the prompt file/ );
  } );

  it( 'throws ValidationError for invalid messages or toolChoice', () => {
    expect( () => parseAgentGenerateArgs( {
      messages: [ { content: 'Hello' } ]
    } ) ).toThrow( ValidationError );

    expect( () => parseAgentGenerateArgs( {
      messages: [ { role: 'moderator', content: 'Hello' } ]
    } ) ).toThrow( ValidationError );

    expect( () => parseAgentGenerateArgs( {
      toolChoice: { type: 'tool' }
    } ) ).toThrow( ValidationError );
  } );
} );

describe( 'parseAgentGenerateWithStreamingArgs', () => {
  it( 'defaults omitted args and accepts onChunk', () => {
    expect( parseAgentGenerateWithStreamingArgs() ).toEqual( { messages: [] } );

    const parsed = parseAgentGenerateWithStreamingArgs( { onChunk: () => {} } );
    expect( parsed.messages ).toEqual( [] );
    expect( parsed.onChunk ).toBeTypeOf( 'function' );
  } );

  it( 'rejects stream-only callbacks', () => {
    expect( () => parseAgentGenerateWithStreamingArgs( { onFinish: () => {} } ) ).toThrow( /unrecognized key/i );
  } );
} );

describe( 'parseAgentStreamArgs', () => {
  it( 'defaults omitted args and keeps stream callbacks', () => {
    expect( parseAgentStreamArgs() ).toEqual( { messages: [] } );

    const parsed = parseAgentStreamArgs( {
      onFinish: () => {},
      onError: () => {},
      onChunk: () => {}
    } );

    expect( parsed.messages ).toEqual( [] );
    expect( parsed.onFinish ).toBeTypeOf( 'function' );
    expect( parsed.onError ).toBeTypeOf( 'function' );
    expect( parsed.onChunk ).toBeTypeOf( 'function' );
  } );
} );
