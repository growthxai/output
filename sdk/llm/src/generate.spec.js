import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const aiFns = vi.hoisted( () => ( {
  generateText: vi.fn(),
  streamText: vi.fn(),
  generateImage: vi.fn()
} ) );

const validators = vi.hoisted( () => ( {
  validateGenerateTextArgs: vi.fn(),
  validateGenerateTextWithStreamingArgs: vi.fn(),
  validateStreamTextArgs: vi.fn(),
  validateGenerateImageArgs: vi.fn()
} ) );

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

const traceMocks = vi.hoisted( () => ( {
  startTrace: vi.fn(),
  endTraceWithError: vi.fn()
} ) );

const wrapMocks = vi.hoisted( () => ( {
  wrapTextResponse: vi.fn(),
  wrapImageResponse: vi.fn()
} ) );

const errorMocks = vi.hoisted( () => ( {
  mapAiError: vi.fn( error => error )
} ) );

const streamMocks = vi.hoisted( () => ( {
  drainStream: vi.fn()
} ) );

vi.mock( 'ai', () => aiFns );

vi.mock( './validations.js', () => validators );

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

vi.mock( './utils/trace.js', () => ( {
  startTrace: ( ...args ) => traceMocks.startTrace( ...args ),
  endTraceWithError: ( ...args ) => traceMocks.endTraceWithError( ...args )
} ) );

vi.mock( './utils/response_wrappers.js', () => ( {
  wrapTextResponse: ( ...args ) => wrapMocks.wrapTextResponse( ...args ),
  wrapImageResponse: ( ...args ) => wrapMocks.wrapImageResponse( ...args )
} ) );

vi.mock( './utils/error_handler.js', () => ( {
  mapAiError: ( ...args ) => errorMocks.mapAiError( ...args )
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

    validators.validateGenerateTextArgs.mockReset();
    validators.validateGenerateTextWithStreamingArgs.mockReset();
    validators.validateStreamTextArgs.mockReset();
    validators.validateGenerateImageArgs.mockReset();

    promptMocks.loadPrompt.mockReset().mockReturnValue( loadedPrompt );
    skillMocks.loadSkills.mockReset().mockReturnValue( loadedSkills );

    optionMocks.loadAiSdkTextOptions.mockReset().mockReturnValue( textOptions );
    optionMocks.loadAiSdkImageOptions.mockReset().mockReturnValue( imageOptions );

    traceMocks.startTrace.mockReset().mockReturnValue( 'trace-id' );
    traceMocks.endTraceWithError.mockReset();

    wrapMocks.wrapTextResponse.mockReset().mockResolvedValue( { wrapped: textResponse } );
    wrapMocks.wrapImageResponse.mockReset().mockResolvedValue( { wrapped: imageResponse } );

    errorMocks.mapAiError.mockReset().mockImplementation( error => error );
    streamMocks.drainStream.mockReset().mockResolvedValue( undefined );
  } );

  afterEach( async () => {
    await vi.resetModules();
  } );

  describe( 'generateText', () => {
    it( 'validates, loads prompt skills, traces, calls AI SDK, and wraps the response', async () => {
      const { generateText } = await importSut();
      const variables = { topic: 'testing' };
      const tools = { userTool: true };

      const result = await generateText( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        tools,
        temperature: 0.2
      } );

      expect( validators.validateGenerateTextArgs ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        maxSteps: undefined,
        tools,
        skills: undefined
      } );
      expect( promptMocks.loadPrompt ).toHaveBeenCalledWith( 'test@v1', variables, '/prompts' );
      expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
      expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
        name: 'generateText',
        promptFile: 'test@v1',
        variables,
        prompt: loadedPrompt
      } );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills,
        tools
      } );
      expect( aiFns.generateText ).toHaveBeenCalledWith( {
        ...textOptions,
        allowSystemInMessages: true,
        maxRetries: 0,
        temperature: 0.2
      } );
      expect( wrapMocks.wrapTextResponse ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        providerId: 'openai',
        modelId: 'test-model',
        response: textResponse
      } );
      expect( result ).toEqual( { wrapped: textResponse } );
    } );

    it( 'forwards call-argument maxSteps and skills to validation, not to AI SDK options', async () => {
      const { generateText } = await importSut();
      const callSkills = [ { name: 'from-call' } ];

      await generateText( { prompt: 'test@v1', skills: callSkills, maxSteps: 4 } );

      expect( validators.validateGenerateTextArgs ).toHaveBeenCalledWith( expect.objectContaining( {
        skills: callSkills,
        maxSteps: 4,
        tools: undefined
      } ) );
      expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills,
        tools: undefined
      } );
      expect( aiFns.generateText ).toHaveBeenCalledWith( expect.not.objectContaining( {
        maxSteps: 4,
        skills: callSkills
      } ) );
    } );

    it( 'lets caller stopWhen replace options stopWhen', async () => {
      const { generateText } = await importSut();
      const stopWhen = { type: 'custom-stop' };
      optionMocks.loadAiSdkTextOptions.mockReturnValueOnce( {
        ...textOptions,
        stopWhen: { type: 'step-count', count: 10 }
      } );

      await generateText( { prompt: 'test@v1', stopWhen } );

      expect( aiFns.generateText ).toHaveBeenCalledWith( expect.objectContaining( { stopWhen } ) );
    } );

    it( 'propagates validation errors before tracing or calling AI SDK', async () => {
      const validationError = new Error( 'Invalid args' );
      validators.validateGenerateTextArgs.mockImplementationOnce( () => {
        throw validationError;
      } );
      const { generateText } = await importSut();

      await expect( generateText( { prompt: '' } ) ).rejects.toThrow( validationError );
      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( traceMocks.startTrace ).not.toHaveBeenCalled();
      expect( aiFns.generateText ).not.toHaveBeenCalled();
    } );

    it( 'traces and rethrows AI SDK errors', async () => {
      const error = new Error( 'Provider failed' );
      const mappedError = new Error( 'Mapped provider failed' );
      aiFns.generateText.mockRejectedValueOnce( error );
      errorMocks.mapAiError.mockReturnValueOnce( mappedError );
      const { generateText } = await importSut();

      await expect( generateText( { prompt: 'test@v1' } ) ).rejects.toThrow( mappedError );
      expect( errorMocks.mapAiError ).toHaveBeenCalledWith( error );
      expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        error: mappedError
      } );
    } );
  } );

  describe( 'generateTextWithStreaming', () => {
    it( 'consumes the stream and returns a completed wrapped response', async () => {
      const { generateTextWithStreaming } = await importSut();
      const variables = { topic: 'testing' };
      const output = { summary: 'Structured result' };
      const chunk = { type: 'text-delta', text: 'TEXT' };
      const onChunk = vi.fn();
      const wrappedResponse = { wrapped: textResponse, output };
      const stream = { output: Promise.resolve( output ) };
      const response = { ...textResponse };
      wrapMocks.wrapTextResponse.mockResolvedValueOnce( wrappedResponse );
      aiFns.streamText.mockImplementationOnce( options => {
        options.onChunk( { chunk } );
        options.onFinish( response );
        return stream;
      } );

      const result = await generateTextWithStreaming( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        onChunk,
        temperature: 0.2
      } );

      expect( validators.validateGenerateTextWithStreamingArgs ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        maxSteps: undefined,
        tools: undefined,
        skills: undefined
      } );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills,
        tools: undefined
      } );
      expect( aiFns.streamText ).toHaveBeenCalledWith( {
        ...textOptions,
        allowSystemInMessages: true,
        maxRetries: 0,
        temperature: 0.2,
        onChunk,
        onFinish: expect.any( Function ),
        onError: expect.any( Function )
      } );
      expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, undefined );
      expect( onChunk ).toHaveBeenCalledWith( { chunk } );
      expect( wrapMocks.wrapTextResponse ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        providerId: 'openai',
        modelId: 'test-model',
        response: { ...textResponse, output }
      } );
      expect( result ).toBe( wrappedResponse );
    } );

    it( 'maps stream errors and rejects', async () => {
      const error = new Error( 'Provider failed' );
      const mappedError = new Error( 'Mapped provider failed' );
      const stream = { output: Promise.resolve( undefined ) };
      errorMocks.mapAiError.mockReturnValueOnce( mappedError );
      streamMocks.drainStream.mockRejectedValueOnce( error );
      aiFns.streamText.mockReturnValueOnce( stream );
      const { generateTextWithStreaming } = await importSut();

      await expect( generateTextWithStreaming( { prompt: 'test@v1' } ) ).rejects.toThrow( mappedError );

      expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, undefined );
      expect( errorMocks.mapAiError ).toHaveBeenCalledWith( error );
      expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        error: mappedError
      } );
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

      expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, abortController.signal );
      expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        error: abortReason
      } );
    } );
  } );

  describe( 'streamText', () => {
    it( 'validates, loads prompt skills, traces, calls AI SDK, and returns the stream result', async () => {
      const { streamText } = await importSut();
      const variables = { topic: 'testing' };
      const onFinish = vi.fn();
      const tools = { userTool: true };

      const result = streamText( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        onFinish,
        tools,
        temperature: 0.2
      } );

      expect( validators.validateStreamTextArgs ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        maxSteps: undefined,
        onFinish,
        onError: undefined,
        tools,
        skills: undefined
      } );
      expect( promptMocks.loadPrompt ).toHaveBeenCalledWith( 'test@v1', variables, '/prompts' );
      expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
      expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
        name: 'streamText',
        promptFile: 'test@v1',
        variables,
        prompt: loadedPrompt
      } );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        skills: loadedSkills,
        tools
      } );
      expect( aiFns.streamText ).toHaveBeenCalledWith( {
        ...textOptions,
        allowSystemInMessages: true,
        maxRetries: 0,
        temperature: 0.2,
        onFinish: expect.any( Function ),
        onError: expect.any( Function )
      } );
      const callOptions = aiFns.streamText.mock.calls[0][0];
      await callOptions.onFinish( textResponse );
      expect( wrapMocks.wrapTextResponse ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        providerId: 'openai',
        modelId: 'test-model',
        response: textResponse
      } );
      expect( onFinish ).toHaveBeenCalledWith( { wrapped: textResponse } );
      expect( result ).toBe( streamResult );
    } );

    it( 'lets caller stopWhen replace options stopWhen', async () => {
      const { streamText } = await importSut();
      const stopWhen = { type: 'custom-stop' };
      optionMocks.loadAiSdkTextOptions.mockReturnValueOnce( {
        ...textOptions,
        stopWhen: { type: 'step-count', count: 10 }
      } );

      streamText( { prompt: 'test@v1', stopWhen } );

      expect( aiFns.streamText ).toHaveBeenCalledWith( expect.objectContaining( { stopWhen } ) );
    } );

    it( 'traces stream onError events and calls the user callback', async () => {
      const { streamText } = await importSut();
      const onError = vi.fn();
      const error = new Error( 'Stream failed' );
      const mappedError = new Error( 'Mapped stream failed' );
      errorMocks.mapAiError.mockReturnValueOnce( mappedError );

      streamText( { prompt: 'test@v1', onError } );
      const callOptions = aiFns.streamText.mock.calls[0][0];
      callOptions.onError( { error } );

      expect( errorMocks.mapAiError ).toHaveBeenCalledWith( error );
      expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        error: mappedError
      } );
      expect( onError ).toHaveBeenCalledWith( { error: mappedError } );
    } );

    it( 'does not pass the raw onFinish or onError callbacks to AI SDK', async () => {
      const { streamText } = await importSut();
      const onFinish = vi.fn();
      const onError = vi.fn();

      streamText( { prompt: 'test@v1', onFinish, onError } );
      const callOptions = aiFns.streamText.mock.calls[0][0];

      expect( callOptions.onFinish ).not.toBe( onFinish );
      expect( callOptions.onError ).not.toBe( onError );
    } );

    it( 'propagates validation errors before loading or tracing', async () => {
      const validationError = new Error( 'Invalid args' );
      validators.validateStreamTextArgs.mockImplementationOnce( () => {
        throw validationError;
      } );
      const { streamText } = await importSut();

      expect( () => streamText( { prompt: '' } ) ).toThrow( validationError );
      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( skillMocks.loadSkills ).not.toHaveBeenCalled();
      expect( traceMocks.startTrace ).not.toHaveBeenCalled();
      expect( aiFns.streamText ).not.toHaveBeenCalled();
    } );

    it( 'traces and rethrows synchronous AI SDK errors', async () => {
      const error = new Error( 'Invalid model' );
      const mappedError = new Error( 'Mapped invalid model' );
      aiFns.streamText.mockImplementationOnce( () => {
        throw error;
      } );
      errorMocks.mapAiError.mockReturnValueOnce( mappedError );
      const { streamText } = await importSut();

      expect( () => streamText( { prompt: 'test@v1' } ) ).toThrow( mappedError );
      expect( errorMocks.mapAiError ).toHaveBeenCalledWith( error );
      expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        error: mappedError
      } );
    } );
  } );

  describe( 'generateImage', () => {
    it( 'validates, loads prompt, traces, calls AI SDK, and wraps the response', async () => {
      const { generateImage } = await importSut();
      const variables = { scene: 'race cars' };
      const images = [ Buffer.from( 'image-bytes' ) ];
      const mask = Buffer.from( 'mask-bytes' );

      const result = await generateImage( {
        prompt: 'image@v1',
        variables,
        promptDir: '/prompts',
        images,
        mask,
        n: 2,
        providerOptions: { openai: { background: 'transparent' } }
      } );

      expect( validators.validateGenerateImageArgs ).toHaveBeenCalledWith( {
        prompt: 'image@v1',
        variables,
        promptDir: '/prompts',
        images,
        mask
      } );
      expect( promptMocks.loadPrompt ).toHaveBeenCalledWith( 'image@v1', variables, '/prompts' );
      expect( skillMocks.loadSkills ).not.toHaveBeenCalled();
      expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
        name: 'generateImage',
        promptFile: 'image@v1',
        variables,
        prompt: loadedPrompt
      } );
      expect( optionMocks.loadAiSdkImageOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        images,
        mask
      } );
      expect( aiFns.generateImage ).toHaveBeenCalledWith( {
        ...imageOptions,
        maxRetries: 0,
        n: 2,
        providerOptions: { openai: { background: 'transparent' } }
      } );
      expect( wrapMocks.wrapImageResponse ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        providerId: 'openai',
        modelId: 'test-model',
        response: imageResponse
      } );
      expect( result ).toEqual( { wrapped: imageResponse } );
    } );

    it( 'supports text-to-image calls without images or mask', async () => {
      const { generateImage } = await importSut();

      await generateImage( { prompt: 'image@v1' } );

      expect( validators.validateGenerateImageArgs ).toHaveBeenCalledWith( {
        prompt: 'image@v1',
        variables: undefined,
        promptDir: undefined,
        images: undefined,
        mask: undefined
      } );
      expect( optionMocks.loadAiSdkImageOptions ).toHaveBeenCalledWith( {
        prompt: loadedPrompt,
        images: undefined,
        mask: undefined
      } );
    } );

    it( 'propagates validation errors before loading or tracing', async () => {
      const validationError = new Error( 'Invalid image args' );
      validators.validateGenerateImageArgs.mockImplementationOnce( () => {
        throw validationError;
      } );
      const { generateImage } = await importSut();

      await expect( generateImage( { prompt: '' } ) ).rejects.toThrow( validationError );
      expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
      expect( traceMocks.startTrace ).not.toHaveBeenCalled();
      expect( aiFns.generateImage ).not.toHaveBeenCalled();
    } );

    it( 'traces and rethrows AI SDK errors', async () => {
      const error = new Error( 'Image provider failed' );
      const mappedError = new Error( 'Mapped image provider failed' );
      aiFns.generateImage.mockRejectedValueOnce( error );
      errorMocks.mapAiError.mockReturnValueOnce( mappedError );
      const { generateImage } = await importSut();

      await expect( generateImage( { prompt: 'image@v1' } ) ).rejects.toThrow( mappedError );
      expect( errorMocks.mapAiError ).toHaveBeenCalledWith( error );
      expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        error: mappedError
      } );
    } );
  } );
} );
