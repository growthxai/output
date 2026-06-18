import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const aiFns = vi.hoisted( () => ( {
  generateText: vi.fn(),
  streamText: vi.fn(),
  generateImage: vi.fn(),
  stepCountIs: vi.fn( count => ( { type: 'step-count', count } ) )
} ) );

const validators = vi.hoisted( () => ( {
  validateGenerateTextArgs: vi.fn(),
  validateStreamTextArgs: vi.fn(),
  validateGenerateImageArgs: vi.fn()
} ) );

const promptMocks = vi.hoisted( () => ( {
  loadPrompt: vi.fn(),
  prepareTextPrompt: vi.fn()
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
  wrapStreamOnFinishResponse: vi.fn(),
  wrapImageResponse: vi.fn()
} ) );

const errorMocks = vi.hoisted( () => ( {
  mapAiError: vi.fn( error => error )
} ) );

vi.mock( 'ai', () => aiFns );

vi.mock( './validations.js', () => validators );

vi.mock( './prompt/loader.js', () => ( {
  loadPrompt: ( ...args ) => promptMocks.loadPrompt( ...args )
} ) );

vi.mock( './prompt/prepare_text.js', () => ( {
  prepareTextPrompt: ( ...args ) => promptMocks.prepareTextPrompt( ...args )
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
  wrapStreamOnFinishResponse: ( ...args ) => wrapMocks.wrapStreamOnFinishResponse( ...args ),
  wrapImageResponse: ( ...args ) => wrapMocks.wrapImageResponse( ...args )
} ) );

vi.mock( './utils/error_handler.js', () => ( {
  mapAiError: ( ...args ) => errorMocks.mapAiError( ...args )
} ) );

const importSut = async () => import( './ai_sdk.js' );

const loadedPrompt = {
  name: 'test@v1',
  config: { model: 'test-model' },
  messages: [ { role: 'user', content: 'Hello' } ]
};

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

describe( 'ai_sdk', () => {
  beforeEach( () => {
    aiFns.generateText.mockReset().mockResolvedValue( textResponse );
    aiFns.streamText.mockReset().mockReturnValue( streamResult );
    aiFns.generateImage.mockReset().mockResolvedValue( imageResponse );
    aiFns.stepCountIs.mockReset().mockImplementation( count => ( { type: 'step-count', count } ) );

    validators.validateGenerateTextArgs.mockReset();
    validators.validateStreamTextArgs.mockReset();
    validators.validateGenerateImageArgs.mockReset();

    promptMocks.loadPrompt.mockReset().mockReturnValue( loadedPrompt );
    promptMocks.prepareTextPrompt.mockReset().mockReturnValue( {
      loadedPrompt,
      tools: null
    } );

    optionMocks.loadAiSdkTextOptions.mockReset().mockReturnValue( textOptions );
    optionMocks.loadAiSdkImageOptions.mockReset().mockReturnValue( imageOptions );

    traceMocks.startTrace.mockReset().mockReturnValue( 'trace-id' );
    traceMocks.endTraceWithError.mockReset();

    wrapMocks.wrapTextResponse.mockReset().mockResolvedValue( { wrapped: textResponse } );
    wrapMocks.wrapStreamOnFinishResponse.mockReset().mockReturnValue( {
      onFinish: vi.fn()
    } );
    wrapMocks.wrapImageResponse.mockReset().mockResolvedValue( { wrapped: imageResponse } );

    errorMocks.mapAiError.mockReset().mockImplementation( error => error );
  } );

  afterEach( async () => {
    await vi.resetModules();
  } );

  describe( 'generateText', () => {
    it( 'prepares, validates, traces, calls AI SDK, and wraps the response', async () => {
      const { generateText } = await importSut();
      const variables = { topic: 'testing' };
      const tools = { calculator: { description: 'Calculator' } };
      const skills = [ { name: 'style', description: 'Style', instructions: '# Style' } ];

      promptMocks.prepareTextPrompt.mockReturnValueOnce( {
        loadedPrompt,
        tools
      } );

      const result = await generateText( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        skills,
        maxSteps: 4,
        tools: { userTool: true },
        temperature: 0.2
      } );

      expect( promptMocks.prepareTextPrompt ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        skills,
        tools: { userTool: true }
      } );
      expect( validators.validateGenerateTextArgs ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        skills,
        maxSteps: 4
      } );
      expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
        name: 'generateText',
        prompt: 'test@v1',
        variables,
        loadedPrompt
      } );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( loadedPrompt );
      expect( aiFns.stepCountIs ).toHaveBeenCalledWith( 4 );
      expect( aiFns.generateText ).toHaveBeenCalledWith( {
        ...textOptions,
        allowSystemInMessages: true,
        maxRetries: 0,
        tools,
        temperature: 0.2,
        stopWhen: { type: 'step-count', count: 4 }
      } );
      expect( wrapMocks.wrapTextResponse ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        modelId: 'test-model',
        response: textResponse
      } );
      expect( result ).toEqual( { wrapped: textResponse } );
    } );

    it( 'uses resolved dynamic skills', async () => {
      const { generateText } = await importSut();
      const variables = { topic: 'testing' };
      const resolvedSkills = [ { name: 'dynamic', description: 'Dynamic', instructions: '# Dynamic' } ];
      const skills = vi.fn().mockResolvedValue( resolvedSkills );

      await generateText( { prompt: 'test@v1', variables, skills } );

      expect( skills ).toHaveBeenCalledWith( variables );
      expect( promptMocks.prepareTextPrompt ).toHaveBeenCalledWith( expect.objectContaining( {
        skills: resolvedSkills
      } ) );
    } );

    it( 'omits tools and stopWhen when no tools are prepared', async () => {
      const { generateText } = await importSut();

      await generateText( { prompt: 'test@v1' } );

      expect( aiFns.stepCountIs ).not.toHaveBeenCalled();
      expect( aiFns.generateText ).toHaveBeenCalledWith( {
        ...textOptions,
        allowSystemInMessages: true,
        maxRetries: 0
      } );
    } );

    it( 'preserves caller-provided stopWhen when tools are prepared', async () => {
      const { generateText } = await importSut();
      const stopWhen = { type: 'custom-stop' };
      promptMocks.prepareTextPrompt.mockReturnValueOnce( {
        loadedPrompt,
        tools: { load_skill: { description: 'Load skill' } }
      } );

      await generateText( { prompt: 'test@v1', stopWhen } );

      expect( aiFns.stepCountIs ).not.toHaveBeenCalled();
      expect( aiFns.generateText ).toHaveBeenCalledWith( expect.objectContaining( {
        stopWhen
      } ) );
    } );

    it( 'propagates validation errors before tracing or calling AI SDK', async () => {
      const validationError = new Error( 'Invalid args' );
      validators.validateGenerateTextArgs.mockImplementationOnce( () => {
        throw validationError;
      } );
      const { generateText } = await importSut();

      await expect( generateText( { prompt: '' } ) ).rejects.toThrow( validationError );
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

  describe( 'streamText', () => {
    it( 'prepares, validates, traces, calls AI SDK, and returns the stream result', async () => {
      const { streamText } = await importSut();
      const variables = { topic: 'testing' };
      const onFinish = vi.fn();
      const tools = { calculator: { description: 'Calculator' } };
      const skills = [ { name: 'style', description: 'Style', instructions: '# Style' } ];

      promptMocks.prepareTextPrompt.mockReturnValueOnce( {
        loadedPrompt,
        tools
      } );

      const result = streamText( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        skills,
        maxSteps: 4,
        onFinish,
        tools: { userTool: true },
        temperature: 0.2
      } );

      expect( validators.validateStreamTextArgs ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        skills,
        maxSteps: 4
      } );
      expect( promptMocks.prepareTextPrompt ).toHaveBeenCalledWith( {
        prompt: 'test@v1',
        variables,
        promptDir: '/prompts',
        skills,
        tools: { userTool: true }
      } );
      expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
        name: 'streamText',
        prompt: 'test@v1',
        variables,
        loadedPrompt
      } );
      expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( loadedPrompt );
      expect( wrapMocks.wrapStreamOnFinishResponse ).toHaveBeenCalledWith( {
        traceId: 'trace-id',
        modelId: 'test-model',
        onFinish
      } );
      expect( aiFns.stepCountIs ).toHaveBeenCalledWith( 4 );
      expect( aiFns.streamText ).toHaveBeenCalledWith( {
        ...textOptions,
        allowSystemInMessages: true,
        maxRetries: 0,
        tools,
        temperature: 0.2,
        stopWhen: { type: 'step-count', count: 4 },
        onFinish: expect.any( Function ),
        onError: expect.any( Function )
      } );
      expect( result ).toBe( streamResult );
    } );

    it( 'uses resolved dynamic skills', async () => {
      const { streamText } = await importSut();
      const variables = { topic: 'testing' };
      const resolvedSkills = [ { name: 'dynamic', description: 'Dynamic', instructions: '# Dynamic' } ];
      const skills = vi.fn().mockReturnValue( resolvedSkills );

      streamText( { prompt: 'test@v1', variables, skills } );

      expect( skills ).toHaveBeenCalledWith( variables );
      expect( promptMocks.prepareTextPrompt ).toHaveBeenCalledWith( expect.objectContaining( {
        skills: resolvedSkills
      } ) );
    } );

    it( 'throws when dynamic skills resolve asynchronously', async () => {
      const { streamText } = await importSut();
      const variables = { topic: 'testing' };
      const skills = vi.fn().mockResolvedValue( [
        { name: 'dynamic', description: 'Dynamic', instructions: '# Dynamic' }
      ] );

      expect( () => streamText( { prompt: 'test@v1', variables, skills } ) )
        .toThrow( 'streamText() skills must be synchronous' );

      expect( skills ).toHaveBeenCalledWith( variables );
      expect( promptMocks.prepareTextPrompt ).not.toHaveBeenCalled();
      expect( aiFns.streamText ).not.toHaveBeenCalled();
    } );

    it( 'omits tools and stopWhen when no tools are prepared', async () => {
      const { streamText } = await importSut();

      streamText( { prompt: 'test@v1' } );

      expect( aiFns.stepCountIs ).not.toHaveBeenCalled();
      expect( aiFns.streamText ).toHaveBeenCalledWith( {
        ...textOptions,
        allowSystemInMessages: true,
        maxRetries: 0,
        onFinish: expect.any( Function ),
        onError: expect.any( Function )
      } );
    } );

    it( 'preserves caller-provided stopWhen when tools are prepared', async () => {
      const { streamText } = await importSut();
      const stopWhen = { type: 'custom-stop' };
      promptMocks.prepareTextPrompt.mockReturnValueOnce( {
        loadedPrompt,
        tools: { load_skill: { description: 'Load skill' } }
      } );

      streamText( { prompt: 'test@v1', stopWhen } );

      expect( aiFns.stepCountIs ).not.toHaveBeenCalled();
      expect( aiFns.streamText ).toHaveBeenCalledWith( expect.objectContaining( {
        stopWhen
      } ) );
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
      expect( promptMocks.prepareTextPrompt ).not.toHaveBeenCalled();
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
      expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
        name: 'generateImage',
        prompt: 'image@v1',
        variables,
        loadedPrompt
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
