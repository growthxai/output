import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const aiFns = vi.hoisted( () => ( {
  generateText: vi.fn(),
  streamText: vi.fn(),
  generateImage: vi.fn()
} ) );

const validations = vi.hoisted( () => ( {
  parseGenerateTextArgs: vi.fn(),
  parseGenerateTextWithStreamingArgs: vi.fn(),
  parseStreamTextArgs: vi.fn(),
  parseGenerateImageArgs: vi.fn()
} ) );

const toPromptFileArgs = ( { prompt, ...rest } ) => ( {
  promptFile: prompt,
  ...rest
} );

const promptMocks = vi.hoisted( () => ( {
  loadPrompt: vi.fn()
} ) );

const skillMocks = vi.hoisted( () => ( {
  loadSkills: vi.fn()
} ) );

const optionMocks = vi.hoisted( () => ( {
  loadAiSdkTextOptions: vi.fn(),
  loadAiSdkImageOptions: vi.fn()
} ) );

const wrapMocks = vi.hoisted( () => ( {
  wrapGeneration: vi.fn(),
  wrapStream: vi.fn(),
  streamHooks: { onFinishHook: vi.fn(), onErrorHook: vi.fn() }
} ) );

const streamMocks = vi.hoisted( () => ( {
  drainStream: vi.fn()
} ) );

vi.mock( 'ai', () => aiFns );

vi.mock( './validations.js', () => validations );

vi.mock( './prompt/loader.js', () => ( {
  loadPrompt: ( ...args ) => promptMocks.loadPrompt( ...args )
} ) );

vi.mock( './utils/skills.js', () => ( {
  loadSkills: ( ...args ) => skillMocks.loadSkills( ...args )
} ) );

vi.mock( './ai_sdk_options.js', () => ( {
  loadAiSdkTextOptions: ( ...args ) => optionMocks.loadAiSdkTextOptions( ...args ),
  loadAiSdkImageOptions: ( ...args ) => optionMocks.loadAiSdkImageOptions( ...args )
} ) );

vi.mock( './utils/wrap.js', () => ( {
  wrapGeneration: ( ...args ) => wrapMocks.wrapGeneration( ...args ),
  wrapStream: ( ...args ) => wrapMocks.wrapStream( ...args )
} ) );

vi.mock( './utils/stream.js', () => ( {
  drainStream: ( ...args ) => streamMocks.drainStream( ...args )
} ) );

const importSut = async () => import( './generate.js' );

const loadedPrompt = {
  name: 'test@v1',
  config: { provider: 'openai', model: 'test-model' },
  messages: [ { role: 'user', content: 'Hello' } ]
};

const loadedSkills = [ { name: 'writer', description: 'Writes', instructions: 'Do it.' } ];

const textOptions = {
  model: 'MODEL',
  messages: loadedPrompt.messages,
  providerOptions: { test: true }
};

const textResponse = {
  text: 'TEXT',
  totalUsage: { inputTokens: 1, outputTokens: 2 },
  finishReason: 'stop'
};

const streamResult = {
  textStream: 'TEXT_STREAM',
  fullStream: 'FULL_STREAM'
};

const imageOptions = {
  model: 'IMAGE_MODEL',
  prompt: {
    text: 'Generate an image'
  },
  providerOptions: { openai: { quality: 'high' } }
};

const imageResponse = {
  images: [ { mediaType: 'image/png', base64: 'aW1hZ2U=' } ],
  usage: { inputTokens: 1, outputTokens: 2 }
};

describe( 'generate', () => {
  beforeEach( () => {
    aiFns.generateText.mockReset().mockResolvedValue( textResponse );
    aiFns.streamText.mockReset().mockReturnValue( streamResult );
    aiFns.generateImage.mockReset().mockResolvedValue( imageResponse );

    validations.parseGenerateTextArgs.mockReset().mockImplementation( toPromptFileArgs );
    validations.parseGenerateTextWithStreamingArgs.mockReset().mockImplementation( toPromptFileArgs );
    validations.parseStreamTextArgs.mockReset().mockImplementation( toPromptFileArgs );
    validations.parseGenerateImageArgs.mockReset().mockImplementation( toPromptFileArgs );

    promptMocks.loadPrompt.mockReset().mockReturnValue( loadedPrompt );
    skillMocks.loadSkills.mockReset().mockReturnValue( loadedSkills );

    optionMocks.loadAiSdkTextOptions.mockReset().mockReturnValue( textOptions );
    optionMocks.loadAiSdkImageOptions.mockReset().mockReturnValue( imageOptions );

    wrapMocks.wrapGeneration.mockReset().mockImplementation( async ( { fn } ) => fn() );
    wrapMocks.streamHooks = {
      onFinishHook: vi.fn( async ( response, callback ) => callback?.( response ) ),
      onErrorHook: vi.fn( ( event, callback ) => callback?.( event.error ) )
    };
    wrapMocks.wrapStream.mockReset().mockImplementation( ( { fn } ) => fn( wrapMocks.streamHooks ) );

    streamMocks.drainStream.mockReset().mockResolvedValue( undefined );
  } );

  afterEach( async () => {
    await vi.resetModules();
  } );

  describe( 'generateText', () => {
    it( 'parses args, loads prompt skills, wraps generation, and calls AI SDK', async () => {
      const { generateText } = await importSut();
      const variables = { topic: 'testing' };
      const tools = { userTool: true };
      const output = { type: 'object' };
      const toolChoice = 'required';
      const stopWhen = { type: 'custom-stop' };
      const abortSignal = new AbortController().signal;

      const result = await generateText( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        tools,
        output,
        toolChoice,
        stopWhen,
        abortSignal
      } );

      expect( validations.parseGenerateTextArgs ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        tools,
        output,
        toolChoice,
        stopWhen,
        abortSignal
      } );
      expect( promptMocks.loadPrompt ).toHaveBeenCalledWith( 'test@v1', variables, '/prompts' );
      expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
      expect( wrapMocks.wrapGeneration ).toHaveBeenCalledWith( {
        name: 'generateText',
        prompt: loadedPrompt,
        fn: expect.any( Function )
      } );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills,
        tools,
        output,
        toolChoice,
        stopWhen,
        abortSignal
      } );
      expect( aiFns.generateText ).toHaveBeenCalledWith( textOptions );
      expect( result ).toBe( textResponse );
    } );

    it( 'uses a prompt object without loading a prompt file', async () => {
      validations.parseGenerateTextArgs.mockReturnValueOnce( { promptObject: loadedPrompt } );
      const { generateText } = await importSut();

      await generateText( { prompt: loadedPrompt } );

      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills
      } );
    } );

    it( 'propagates parse errors before wrapping or calling AI SDK', async () => {
      const validationError = new Error( 'Invalid args' );
      validations.parseGenerateTextArgs.mockImplementationOnce( () => {
        throw validationError;
      } );
      const { generateText } = await importSut();

      await expect( generateText( { prompt: '' } ) ).rejects.toThrow( validationError );
      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( wrapMocks.wrapGeneration ).not.toHaveBeenCalled();
      expect( aiFns.generateText ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'generateTextWithStreaming', () => {
    it( 'consumes the stream inside wrapGeneration and returns the completed response', async () => {
      const { generateTextWithStreaming } = await importSut();
      const variables = { topic: 'testing' };
      const output = { summary: 'Structured result' };
      const chunk = { type: 'text-delta', text: 'TEXT' };
      const onChunk = vi.fn();
      const stream = { output: Promise.resolve( output ) };
      const response = { ...textResponse };
      aiFns.streamText.mockImplementationOnce( options => {
        options.onChunk( { chunk } );
        options.onFinish( response );
        return stream;
      } );

      const result = await generateTextWithStreaming( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        onChunk
      } );

      expect( validations.parseGenerateTextWithStreamingArgs ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        onChunk
      } );
      expect( wrapMocks.wrapGeneration ).toHaveBeenCalledWith( {
        name: 'generateTextWithStreaming',
        prompt: loadedPrompt,
        fn: expect.any( Function )
      } );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills
      } );
      expect( aiFns.streamText ).toHaveBeenCalledWith( {
        ...textOptions,
        onChunk,
        onFinish: expect.any( Function ),
        onError: expect.any( Function )
      } );
      expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, undefined );
      expect( onChunk ).toHaveBeenCalledWith( { chunk } );
      expect( result ).toEqual( { ...textResponse, output } );
    } );

    it( 'uses a prompt object without loading a prompt file', async () => {
      const stream = { output: Promise.resolve( undefined ) };
      validations.parseGenerateTextWithStreamingArgs.mockReturnValueOnce( { promptObject: loadedPrompt } );
      aiFns.streamText.mockImplementationOnce( options => {
        options.onFinish( { ...textResponse } );
        return stream;
      } );
      const { generateTextWithStreaming } = await importSut();

      await generateTextWithStreaming( { prompt: loadedPrompt } );

      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills
      } );
    } );

    it( 'omits onChunk when the caller does not provide it', async () => {
      const { generateTextWithStreaming } = await importSut();
      const stream = { output: Promise.resolve( undefined ) };
      aiFns.streamText.mockImplementationOnce( options => {
        options.onFinish( { ...textResponse } );
        return stream;
      } );

      await generateTextWithStreaming( { prompt: 'test@v1' } );
      const callOptions = aiFns.streamText.mock.calls[0][0];

      expect( callOptions ).not.toHaveProperty( 'onChunk' );
    } );

    it( 'rejects with the abort reason', async () => {
      const abortController = new AbortController();
      const abortReason = new Error( 'Cancelled by caller' );
      const stream = { output: Promise.resolve( undefined ) };
      abortController.abort( abortReason );
      streamMocks.drainStream.mockRejectedValueOnce( abortReason );
      aiFns.streamText.mockReturnValueOnce( stream );
      const { generateTextWithStreaming } = await importSut();

      await expect( generateTextWithStreaming( {
        prompt: 'test@v1',
        abortSignal: abortController.signal
      } ) ).rejects.toBe( abortReason );

      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills,
        abortSignal: abortController.signal
      } );
      expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, abortController.signal );
    } );
  } );

  describe( 'streamText', () => {
    it( 'parses args, loads prompt skills, wraps the stream, and calls AI SDK', async () => {
      const { streamText } = await importSut();
      const variables = { topic: 'testing' };
      const onFinish = vi.fn();
      const onChunk = vi.fn();
      const tools = { userTool: true };

      const result = streamText( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        onFinish,
        onChunk,
        tools
      } );

      expect( validations.parseStreamTextArgs ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        onFinish,
        onChunk,
        tools
      } );
      expect( promptMocks.loadPrompt ).toHaveBeenCalledWith( 'test@v1', variables, '/prompts' );
      expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
      expect( wrapMocks.wrapStream ).toHaveBeenCalledWith( {
        name: 'streamText',
        prompt: loadedPrompt,
        fn: expect.any( Function )
      } );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills,
        tools
      } );
      expect( aiFns.streamText ).toHaveBeenCalledWith( {
        ...textOptions,
        onChunk,
        onFinish: expect.any( Function ),
        onError: expect.any( Function )
      } );
      const callOptions = aiFns.streamText.mock.calls[0][0];
      await callOptions.onFinish( textResponse );
      expect( wrapMocks.streamHooks.onFinishHook ).toHaveBeenCalledWith( textResponse, onFinish );
      expect( onFinish ).toHaveBeenCalledWith( textResponse );
      expect( result ).toBe( streamResult );
    } );

    it( 'uses a prompt object without loading a prompt file', async () => {
      validations.parseStreamTextArgs.mockReturnValueOnce( { promptObject: loadedPrompt } );
      const { streamText } = await importSut();

      streamText( { prompt: loadedPrompt } );

      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills
      } );
    } );

    it( 'omits onChunk when the caller does not provide it', async () => {
      const { streamText } = await importSut();

      streamText( { prompt: 'test@v1' } );
      const callOptions = aiFns.streamText.mock.calls[0][0];

      expect( callOptions ).not.toHaveProperty( 'onChunk' );
    } );

    it( 'lets caller stopWhen reach the options loader', async () => {
      const { streamText } = await importSut();
      const stopWhen = { type: 'custom-stop' };

      streamText( { prompt: 'test@v1', stopWhen } );

      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills,
        stopWhen
      } );
      expect( aiFns.streamText ).toHaveBeenCalledWith( expect.objectContaining( textOptions ) );
    } );

    it( 'forwards stream onError through wrapStream with the mapped event payload', async () => {
      const { streamText } = await importSut();
      const onError = vi.fn();
      const error = new Error( 'Stream failed' );
      const mappedError = new Error( 'Mapped stream failed' );

      streamText( { prompt: 'test@v1', onError } );
      const callOptions = aiFns.streamText.mock.calls[0][0];
      callOptions.onError( { error, extra: true } );

      expect( wrapMocks.streamHooks.onErrorHook ).toHaveBeenCalledWith(
        { error, extra: true },
        expect.any( Function )
      );
      wrapMocks.streamHooks.onErrorHook.mock.calls[0][1]( mappedError );
      expect( onError ).toHaveBeenCalledWith( { error: mappedError, extra: true } );
    } );

    it( 'propagates validation errors before loading or wrapping', async () => {
      const validationError = new Error( 'Invalid args' );
      validations.parseStreamTextArgs.mockImplementationOnce( () => {
        throw validationError;
      } );
      const { streamText } = await importSut();

      expect( () => streamText( { prompt: '' } ) ).toThrow( validationError );
      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( skillMocks.loadSkills ).not.toHaveBeenCalled();
      expect( wrapMocks.wrapStream ).not.toHaveBeenCalled();
      expect( aiFns.streamText ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'generateImage', () => {
    it( 'parses args, loads prompt, wraps generation, and calls AI SDK', async () => {
      const { generateImage } = await importSut();
      const variables = { scene: 'race cars' };
      const images = [ Buffer.from( 'image-bytes' ) ];
      const mask = Buffer.from( 'mask-bytes' );
      const abortSignal = AbortSignal.abort();

      const result = await generateImage( {
        prompt: 'image@v1',
        variables,
        promptDir: '/prompts',
        images,
        mask,
        abortSignal
      } );

      expect( validations.parseGenerateImageArgs ).toHaveBeenCalledWith( {
        prompt: 'image@v1',
        variables,
        promptDir: '/prompts',
        images,
        mask,
        abortSignal
      } );
      expect( promptMocks.loadPrompt ).toHaveBeenCalledWith( 'image@v1', variables, '/prompts' );
      expect( skillMocks.loadSkills ).not.toHaveBeenCalled();
      expect( wrapMocks.wrapGeneration ).toHaveBeenCalledWith( {
        name: 'generateImage',
        prompt: loadedPrompt,
        fn: expect.any( Function )
      } );
      expect( optionMocks.loadAiSdkImageOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        images,
        mask,
        abortSignal
      } );
      expect( aiFns.generateImage ).toHaveBeenCalledWith( imageOptions );
      expect( result ).toBe( imageResponse );
    } );

    it( 'uses a prompt object without loading a prompt file', async () => {
      validations.parseGenerateImageArgs.mockReturnValueOnce( { promptObject: loadedPrompt } );
      const { generateImage } = await importSut();

      await generateImage( { prompt: loadedPrompt } );

      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( optionMocks.loadAiSdkImageOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt
      } );
    } );

    it( 'supports text-to-image calls without images or mask', async () => {
      const { generateImage } = await importSut();

      await generateImage( { prompt: 'image@v1' } );

      expect( validations.parseGenerateImageArgs ).toHaveBeenCalledWith( {
        prompt: 'image@v1'
      } );
      expect( optionMocks.loadAiSdkImageOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt
      } );
      expect( aiFns.generateImage ).toHaveBeenCalledWith( imageOptions );
    } );

    it( 'propagates parse errors before loading or wrapping', async () => {
      const validationError = new Error( 'Invalid image args' );
      validations.parseGenerateImageArgs.mockImplementationOnce( () => {
        throw validationError;
      } );
      const { generateImage } = await importSut();

      await expect( generateImage( { prompt: '' } ) ).rejects.toThrow( validationError );
      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( wrapMocks.wrapGeneration ).not.toHaveBeenCalled();
      expect( aiFns.generateImage ).not.toHaveBeenCalled();
    } );
  } );
} );
