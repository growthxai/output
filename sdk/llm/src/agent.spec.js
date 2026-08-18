import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const aiMocks = vi.hoisted( () => ( {
  superConstructor: vi.fn(),
  superGenerate: vi.fn(),
  superStream: vi.fn(),
  stepCountIs: vi.fn( count => ( { type: 'step-count', count } ) )
} ) );

const validators = vi.hoisted( () => ( {
  validateAgentArgs: vi.fn()
} ) );

const promptMocks = vi.hoisted( () => ( {
  loadPrompt: vi.fn()
} ) );

const skillMocks = vi.hoisted( () => ( {
  loadSkills: vi.fn()
} ) );

const optionMocks = vi.hoisted( () => ( {
  loadAiSdkTextOptions: vi.fn()
} ) );

const traceMocks = vi.hoisted( () => ( {
  startTrace: vi.fn(),
  endTraceWithError: vi.fn()
} ) );

const wrapMocks = vi.hoisted( () => ( {
  wrapTextResponse: vi.fn()
} ) );

const errorMocks = vi.hoisted( () => ( {
  mapAiError: vi.fn( error => error )
} ) );

const streamMocks = vi.hoisted( () => ( {
  drainStream: vi.fn()
} ) );

vi.mock( 'ai', () => {
  class MockToolLoopAgent {
    constructor( options ) {
      aiMocks.superConstructor( options );
    }

    async generate( ...args ) {
      return aiMocks.superGenerate( ...args );
    }

    stream( ...args ) {
      return aiMocks.superStream( ...args );
    }
  }

  return {
    ToolLoopAgent: MockToolLoopAgent,
    stepCountIs: ( ...args ) => aiMocks.stepCountIs( ...args )
  };
} );

vi.mock( './validations.js', () => validators );

vi.mock( './prompt/loader.js', () => ( {
  loadPrompt: ( ...args ) => promptMocks.loadPrompt( ...args )
} ) );

vi.mock( './utils/skills.js', () => ( {
  loadSkills: ( ...args ) => skillMocks.loadSkills( ...args )
} ) );

vi.mock( './ai_sdk_options.js', () => ( {
  loadAiSdkTextOptions: ( ...args ) => optionMocks.loadAiSdkTextOptions( ...args )
} ) );

vi.mock( './utils/trace.js', () => ( {
  startTrace: ( ...args ) => traceMocks.startTrace( ...args ),
  endTraceWithError: ( ...args ) => traceMocks.endTraceWithError( ...args )
} ) );

vi.mock( './utils/response_wrappers.js', () => ( {
  wrapTextResponse: ( ...args ) => wrapMocks.wrapTextResponse( ...args )
} ) );

vi.mock( './utils/error_handler.js', () => ( {
  mapAiError: ( ...args ) => errorMocks.mapAiError( ...args )
} ) );

vi.mock( './utils/stream.js', () => ( {
  drainStream: ( ...args ) => streamMocks.drainStream( ...args )
} ) );

const importSut = async () => import( './agent.js' );

const loadedPrompt = {
  name: 'test@v1',
  config: { provider: 'openai', model: 'test-model', maxSteps: 10 },
  messages: [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Initial user message' }
  ]
};

const loadedSkills = [ { name: 'writer', description: 'Writes', instructions: 'Do it.' } ];

const model = { id: 'MODEL' };

const textOptions = {
  model,
  system: [ { role: 'system', content: 'You are concise.' } ],
  messages: [ { role: 'user', content: 'Initial user message' } ],
  providerOptions: { test: true },
  temperature: 0.3
};

const aiResponse = {
  text: 'response',
  response: {
    messages: [ { role: 'assistant', content: 'response' } ]
  }
};

describe( 'Agent', () => {
  beforeEach( () => {
    aiMocks.superConstructor.mockReset();
    aiMocks.superGenerate.mockReset().mockResolvedValue( aiResponse );
    aiMocks.superStream.mockReset().mockReturnValue( { textStream: 'stream' } );
    aiMocks.stepCountIs
      .mockReset()
      .mockImplementation( count => ( { type: 'step-count', count } ) );

    validators.validateAgentArgs.mockReset();
    promptMocks.loadPrompt.mockReset().mockReturnValue( loadedPrompt );
    skillMocks.loadSkills.mockReset().mockReturnValue( loadedSkills );

    optionMocks.loadAiSdkTextOptions.mockReset().mockReturnValue( textOptions );

    traceMocks.startTrace.mockReset().mockReturnValue( 'trace-id' );
    traceMocks.endTraceWithError.mockReset();

    wrapMocks.wrapTextResponse
      .mockReset()
      .mockImplementation( async ( { response } ) => response );
    errorMocks.mapAiError.mockReset().mockImplementation( error => error );
    streamMocks.drainStream.mockReset().mockResolvedValue( undefined );
  } );

  afterEach( async () => {
    await vi.resetModules();
  } );

  it( 'propagates validation errors before loading the prompt', async () => {
    const validationError = new Error( 'Invalid Agent() arguments' );
    validators.validateAgentArgs.mockImplementationOnce( () => {
      throw validationError;
    } );
    const { Agent } = await importSut();

    expect( () => new Agent( {} ) ).toThrow( validationError );
    expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
    expect( skillMocks.loadSkills ).not.toHaveBeenCalled();
    expect( aiMocks.superConstructor ).not.toHaveBeenCalled();
  } );

  it( 'validates, loads prompt skills, and constructs ToolLoopAgent', async () => {
    const { Agent } = await importSut();
    const tools = { search: { description: 'Search' } };
    const prompt = {
      ...loadedPrompt,
      config: { ...loadedPrompt.config, maxSteps: 4 }
    };
    promptMocks.loadPrompt.mockReturnValueOnce( prompt );

    new Agent( {
      prompt: 'test@v1',
      variables: { tone: 'brief' },
      promptDir: '/prompts',
      tools
    } );

    expect( validators.validateAgentArgs ).toHaveBeenCalledWith( {
      prompt: 'test@v1',
      promptDir: '/prompts',
      variables: { tone: 'brief' },
      maxSteps: undefined,
      tools,
      skills: undefined
    } );
    expect( promptMocks.loadPrompt ).toHaveBeenCalledWith( 'test@v1', { tone: 'brief' }, '/prompts' );
    expect( skillMocks.loadSkills ).toHaveBeenCalledWith( prompt );
    expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
      prompt,
      skills: loadedSkills,
      tools
    } );
    expect( aiMocks.stepCountIs ).toHaveBeenCalledWith( 4 );
    expect( aiMocks.superConstructor ).toHaveBeenCalledWith( {
      model,
      providerOptions: { test: true },
      temperature: 0.3,
      instructions: [ { role: 'system', content: 'You are concise.' } ],
      stopWhen: { type: 'step-count', count: 4 }
    } );
  } );

  it( 'forwards call-argument maxSteps and skills to validation, not to ToolLoopAgent', async () => {
    const { Agent } = await importSut();
    const callSkills = [ { name: 'from-call' } ];

    new Agent( { prompt: 'test@v1', skills: callSkills, maxSteps: 4 } );

    expect( validators.validateAgentArgs ).toHaveBeenCalledWith( expect.objectContaining( {
      prompt: 'test@v1',
      variables: undefined,
      promptDir: undefined,
      maxSteps: 4,
      tools: undefined,
      skills: callSkills
    } ) );
    expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
    expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
      prompt: loadedPrompt,
      skills: loadedSkills,
      tools: undefined
    } );
    expect( aiMocks.stepCountIs ).toHaveBeenCalledWith( 10 );
    expect( aiMocks.superConstructor ).toHaveBeenCalledWith( expect.not.objectContaining( {
      maxSteps: 4,
      skills: callSkills
    } ) );
  } );

  it( 'passes option tools through to ToolLoopAgent', async () => {
    const { Agent } = await importSut();
    optionMocks.loadAiSdkTextOptions.mockReturnValueOnce( {
      ...textOptions,
      tools: { load_skill: { description: 'Load skill' } }
    } );

    new Agent( { prompt: 'test@v1' } );

    expect( aiMocks.superConstructor ).toHaveBeenCalledWith(
      expect.objectContaining( {
        tools: { load_skill: { description: 'Load skill' } }
      } )
    );
  } );

  it( 'preserves per-message providerOptions on system messages passed as instructions', async () => {
    const { Agent } = await importSut();
    const systemMessage = {
      role: 'system',
      content: 'You are concise.',
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
    };
    optionMocks.loadAiSdkTextOptions.mockReturnValueOnce( {
      model,
      system: [ systemMessage ],
      messages: [ { role: 'user', content: 'Hello' } ]
    } );

    new Agent( { prompt: 'test@v1' } );

    expect( aiMocks.superConstructor ).toHaveBeenCalledWith(
      expect.objectContaining( {
        instructions: [ systemMessage ]
      } )
    );
  } );

  it( 'omits instructions when there is no system message', async () => {
    const { Agent } = await importSut();
    optionMocks.loadAiSdkTextOptions.mockReturnValueOnce( {
      model,
      system: [],
      messages: [ { role: 'user', content: 'Hello' } ]
    } );

    new Agent( { prompt: 'test@v1' } );

    expect( aiMocks.superConstructor ).toHaveBeenCalledWith(
      expect.not.objectContaining( { instructions: expect.anything() } )
    );
  } );

  it( 'uses caller stopWhen instead of default maxSteps', async () => {
    const { Agent } = await importSut();
    const stopWhen = { type: 'custom-stop' };

    new Agent( { prompt: 'test@v1', stopWhen } );

    expect( aiMocks.stepCountIs ).not.toHaveBeenCalled();
    expect( aiMocks.superConstructor ).toHaveBeenCalledWith(
      expect.objectContaining( {
        stopWhen
      } )
    );
  } );

  it( 'passes custom constructor options through', async () => {
    const { Agent } = await importSut();

    new Agent( { prompt: 'test@v1', temperature: 0.8, seed: 42 } );

    expect( aiMocks.superConstructor ).toHaveBeenCalledWith(
      expect.objectContaining( {
        temperature: 0.8,
        seed: 42
      } )
    );
  } );

  it( 'keeps only user prompt messages as initial generate messages', async () => {
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await agent.generate();

    expect( aiMocks.superGenerate ).toHaveBeenCalledWith( {
      messages: [ { role: 'user', content: 'Initial user message' } ],
      allowSystemInMessages: true
    } );
  } );

  it( 'excludes authored assistant/tool blocks from the initial generate messages', async () => {
    const { Agent } = await importSut();
    optionMocks.loadAiSdkTextOptions.mockReturnValueOnce( {
      model,
      system: [ { role: 'system', content: 'You are concise.' } ],
      messages: [
        { role: 'user', content: 'Initial user message' },
        { role: 'assistant', content: 'Authored assistant block' }
      ]
    } );
    const agent = new Agent( { prompt: 'test@v1' } );

    await agent.generate();

    expect( aiMocks.superGenerate ).toHaveBeenCalledWith( {
      messages: [ { role: 'user', content: 'Initial user message' } ],
      allowSystemInMessages: true
    } );
  } );

  it( 'combines initial, stored, and caller messages for generate', async () => {
    const store = {
      getMessages: vi.fn( () => [
        { role: 'assistant', content: 'Stored reply' }
      ] ),
      addMessages: vi.fn()
    };
    const callerMessage = { role: 'user', content: 'New question' };
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );

    await agent.generate( { messages: [ callerMessage ], maxRetries: 1 } );

    expect( aiMocks.superGenerate ).toHaveBeenCalledWith( {
      messages: [
        { role: 'user', content: 'Initial user message' },
        { role: 'assistant', content: 'Stored reply' },
        callerMessage
      ],
      allowSystemInMessages: true,
      maxRetries: 1
    } );
  } );

  it( 'wraps generate responses and stores the user and response messages', async () => {
    const store = {
      getMessages: vi.fn( () => [] ),
      addMessages: vi.fn()
    };
    const callerMessage = { role: 'user', content: 'New question' };
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );

    const result = await agent.generate( { messages: [ callerMessage ] } );

    expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
      name: 'Agent.generate',
      promptFile: 'test@v1',
      prompt: loadedPrompt,
      variables: undefined
    } );
    expect( wrapMocks.wrapTextResponse ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      providerId: 'openai',
      modelId: 'test-model',
      response: aiResponse
    } );
    expect( store.addMessages ).toHaveBeenCalledWith( [
      callerMessage,
      { role: 'assistant', content: 'response' }
    ] );
    expect( result ).toBe( aiResponse );
  } );

  it( 'traces and rethrows generate errors', async () => {
    const error = new Error( 'Generate failed' );
    aiMocks.superGenerate.mockRejectedValueOnce( error );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await expect( agent.generate() ).rejects.toThrow( error );
    expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      error
    } );
  } );

  it( 'generates with streaming, stores messages, and returns the completed response', async () => {
    const store = {
      getMessages: vi.fn( () => [] ),
      addMessages: vi.fn()
    };
    const callerMessage = { role: 'user', content: 'New question' };
    const output = { summary: 'Structured result' };
    const wrappedResponse = { ...aiResponse, output };
    const chunk = { type: 'text-delta', text: 'response' };
    const onChunk = vi.fn();
    const stream = { output: Promise.resolve( output ) };
    const response = { ...aiResponse };
    wrapMocks.wrapTextResponse.mockResolvedValueOnce( wrappedResponse );
    aiMocks.superStream.mockImplementationOnce( options => {
      options.onChunk( { chunk } );
      options.onFinish( response );
      return stream;
    } );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );

    const result = await agent.generateWithStreaming( {
      messages: [ callerMessage ],
      onChunk,
      maxRetries: 1
    } );

    expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
      name: 'Agent.generateWithStreaming',
      promptFile: 'test@v1',
      prompt: loadedPrompt,
      variables: undefined
    } );
    expect( aiMocks.superStream ).toHaveBeenCalledWith( {
      messages: [
        { role: 'user', content: 'Initial user message' },
        callerMessage
      ],
      allowSystemInMessages: true,
      maxRetries: 1,
      onChunk,
      onFinish: expect.any( Function ),
      onError: expect.any( Function )
    } );
    expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, undefined );
    expect( wrapMocks.wrapTextResponse ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      providerId: 'openai',
      modelId: 'test-model',
      response: { ...aiResponse, output }
    } );
    expect( store.addMessages ).toHaveBeenCalledWith( [
      callerMessage,
      { role: 'assistant', content: 'response' }
    ] );
    expect( onChunk ).toHaveBeenCalledWith( { chunk } );
    expect( result ).toBe( wrappedResponse );
  } );

  it( 'maps generateWithStreaming errors and rejects', async () => {
    const error = new Error( 'Stream failed' );
    const mappedError = new Error( 'Mapped stream failed' );
    const stream = { output: Promise.resolve( undefined ) };
    errorMocks.mapAiError.mockReturnValueOnce( mappedError );
    streamMocks.drainStream.mockRejectedValueOnce( error );
    aiMocks.superStream.mockReturnValueOnce( stream );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await expect( agent.generateWithStreaming() ).rejects.toThrow( mappedError );

    expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, undefined );
    expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      error: mappedError
    } );
  } );

  it( 'rejects generateWithStreaming with the abort reason', async () => {
    const abortController = new AbortController();
    const abortReason = new Error( 'Cancelled by caller' );
    const stream = { output: Promise.resolve( undefined ) };
    abortController.abort( abortReason );
    streamMocks.drainStream.mockRejectedValueOnce( abortReason );
    aiMocks.superStream.mockReturnValueOnce( stream );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await expect( agent.generateWithStreaming( {
      abortSignal: abortController.signal
    } ) ).rejects.toBe( abortReason );

    expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, abortController.signal );
    expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      error: abortReason
    } );
  } );

  it( 'streams with initial, stored, and caller messages', async () => {
    const store = {
      getMessages: vi.fn( () => [
        { role: 'assistant', content: 'Stored reply' }
      ] ),
      addMessages: vi.fn()
    };
    const onFinish = vi.fn();
    const onError = vi.fn();
    const callerMessage = { role: 'user', content: 'New question' };
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );

    const result = await agent.stream( {
      messages: [ callerMessage ],
      onFinish,
      onError,
      maxRetries: 1
    } );

    expect( traceMocks.startTrace ).toHaveBeenCalledWith( {
      name: 'Agent.stream',
      promptFile: 'test@v1',
      prompt: loadedPrompt,
      variables: undefined
    } );
    expect( aiMocks.superStream ).toHaveBeenCalledWith( {
      messages: [
        { role: 'user', content: 'Initial user message' },
        { role: 'assistant', content: 'Stored reply' },
        callerMessage
      ],
      allowSystemInMessages: true,
      maxRetries: 1,
      onFinish: expect.any( Function ),
      onError: expect.any( Function )
    } );
    const streamOptions = aiMocks.superStream.mock.calls[0][0];
    await streamOptions.onFinish( aiResponse );
    expect( wrapMocks.wrapTextResponse ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      providerId: 'openai',
      modelId: 'test-model',
      response: aiResponse
    } );
    expect( onFinish ).toHaveBeenCalledWith( aiResponse );
    expect( result ).toEqual( { textStream: 'stream' } );
    expect( store.addMessages ).not.toHaveBeenCalled();
  } );

  it( 'traces stream onError events and calls the user callback', async () => {
    const onError = vi.fn();
    const error = new Error( 'Stream failed' );
    const mappedError = new Error( 'Mapped stream failed' );
    errorMocks.mapAiError.mockReturnValueOnce( mappedError );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await agent.stream( { onError } );
    const streamOptions = aiMocks.superStream.mock.calls[0][0];
    streamOptions.onError( { error } );

    expect( errorMocks.mapAiError ).toHaveBeenCalledWith( error );
    expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      error: mappedError
    } );
    expect( onError ).toHaveBeenCalledWith( { error: mappedError } );
  } );

  it( 'traces and rethrows stream errors', async () => {
    const error = new Error( 'Stream failed' );
    aiMocks.superStream.mockImplementationOnce( () => {
      throw error;
    } );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await expect( agent.stream() ).rejects.toThrow( error );
    expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      error
    } );
  } );
} );

describe( 'createMemoryConversationStore', () => {
  it( 'stores messages in memory', async () => {
    const { createMemoryConversationStore } = await importSut();
    const store = createMemoryConversationStore();

    store.addMessages( [ { role: 'user', content: 'Hello' } ] );
    store.addMessages( [ { role: 'assistant', content: 'Hi' } ] );

    expect( store.getMessages() ).toEqual( [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' }
    ] );
  } );
} );
