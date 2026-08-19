import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const aiMocks = vi.hoisted( () => ( {
  superConstructor: vi.fn(),
  superGenerate: vi.fn(),
  superStream: vi.fn()
} ) );

const validations = vi.hoisted( () => ( {
  parseAgentArgs: vi.fn(),
  parseAgentGenerateArgs: vi.fn(),
  parseAgentGenerateWithStreamingArgs: vi.fn(),
  parseAgentStreamArgs: vi.fn()
} ) );

const toPromptFileArgs = ( { prompt, ...rest } ) => ( {
  promptFile: prompt,
  ...rest
} );

const toAgentMethodArgs = ( args = {} ) => ( {
  messages: [],
  ...args
} );

const promptMocks = vi.hoisted( () => ( {
  loadPrompt: vi.fn()
} ) );

const skillMocks = vi.hoisted( () => ( {
  loadSkills: vi.fn()
} ) );

const optionMocks = vi.hoisted( () => ( {
  loadAiSdkTextOptions: vi.fn()
} ) );

const wrapMocks = vi.hoisted( () => ( {
  wrapGeneration: vi.fn(),
  wrapStream: vi.fn(),
  streamHooks: { onFinishHook: vi.fn(), onErrorHook: vi.fn() }
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

  return { ToolLoopAgent: MockToolLoopAgent };
} );

vi.mock( './validations.js', () => validations );

vi.mock( './prompt/loader.js', () => ( {
  loadPrompt: ( ...args ) => promptMocks.loadPrompt( ...args )
} ) );

vi.mock( './utils/skills.js', () => ( {
  loadSkills: ( ...args ) => skillMocks.loadSkills( ...args )
} ) );

vi.mock( './ai_sdk_options.js', () => ( {
  loadAiSdkTextOptions: ( ...args ) => optionMocks.loadAiSdkTextOptions( ...args )
} ) );

vi.mock( './utils/wrap.js', () => ( {
  wrapGeneration: ( ...args ) => wrapMocks.wrapGeneration( ...args ),
  wrapStream: ( ...args ) => wrapMocks.wrapStream( ...args )
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

const assistantMessage = { role: 'assistant', content: 'response' };

const aiResponse = {
  text: 'response',
  finishReason: 'stop',
  responseMessages: [ assistantMessage ]
};

describe( 'Agent', () => {
  beforeEach( () => {
    aiMocks.superConstructor.mockReset();
    aiMocks.superGenerate.mockReset().mockResolvedValue( aiResponse );
    aiMocks.superStream.mockReset().mockReturnValue( { textStream: 'stream' } );

    validations.parseAgentArgs.mockReset().mockImplementation( toPromptFileArgs );
    validations.parseAgentGenerateArgs.mockReset().mockImplementation( toAgentMethodArgs );
    validations.parseAgentGenerateWithStreamingArgs.mockReset().mockImplementation( toAgentMethodArgs );
    validations.parseAgentStreamArgs.mockReset().mockImplementation( toAgentMethodArgs );

    promptMocks.loadPrompt.mockReset().mockReturnValue( loadedPrompt );
    skillMocks.loadSkills.mockReset().mockReturnValue( loadedSkills );

    optionMocks.loadAiSdkTextOptions.mockReset().mockReturnValue( textOptions );

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

  it( 'propagates parse errors before loading the prompt', async () => {
    const validationError = new Error( 'Invalid Agent() arguments' );
    validations.parseAgentArgs.mockImplementationOnce( () => {
      throw validationError;
    } );
    const { Agent } = await importSut();

    expect( () => new Agent( {} ) ).toThrow( validationError );
    expect( promptMocks.loadPrompt ).not.toHaveBeenCalled();
    expect( skillMocks.loadSkills ).not.toHaveBeenCalled();
    expect( aiMocks.superConstructor ).not.toHaveBeenCalled();
  } );

  it( 'parses args, loads prompt skills, and constructs ToolLoopAgent', async () => {
    const { Agent } = await importSut();
    const tools = { search: { description: 'Search' } };
    const output = { type: 'object' };
    const stopWhen = { type: 'custom-stop' };
    const conversationStore = { getMessages() {}, addMessages() {} };

    new Agent( {
      prompt: 'test@v1',
      variables: { tone: 'brief' },
      promptDir: '/prompts',
      tools,
      output,
      stopWhen,
      conversationStore
    } );

    expect( validations.parseAgentArgs ).toHaveBeenCalledWith( {
      prompt: 'test@v1',
      variables: { tone: 'brief' },
      promptDir: '/prompts',
      tools,
      output,
      stopWhen,
      conversationStore
    } );
    expect( promptMocks.loadPrompt ).toHaveBeenCalledWith( 'test@v1', { tone: 'brief' }, '/prompts' );
    expect( skillMocks.loadSkills ).toHaveBeenCalledWith( loadedPrompt );
    expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( {
      prompt: loadedPrompt,
      skills: loadedSkills,
      tools,
      output,
      stopWhen
    } );
    expect( aiMocks.superConstructor ).toHaveBeenCalledWith( {
      model,
      providerOptions: { test: true },
      temperature: 0.3,
      instructions: [ { role: 'system', content: 'You are concise.' } ]
    } );
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

  it( 'keeps only user prompt messages as initial generate messages', async () => {
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await agent.generate();

    expect( validations.parseAgentGenerateArgs ).toHaveBeenCalledWith( undefined );
    expect( wrapMocks.wrapGeneration ).toHaveBeenCalledWith( {
      name: 'Agent.generate',
      prompt: loadedPrompt,
      fn: expect.any( Function )
    } );
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

  it( 'combines initial, stored, and caller messages and forwards generate options', async () => {
    const store = {
      getMessages: vi.fn( () => [
        { role: 'assistant', content: 'Stored reply' }
      ] ),
      addMessages: vi.fn()
    };
    const callerMessage = { role: 'user', content: 'New question' };
    const abortSignal = AbortSignal.abort();
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );

    await agent.generate( {
      messages: [ callerMessage ],
      abortSignal,
      toolChoice: 'required'
    } );

    expect( validations.parseAgentGenerateArgs ).toHaveBeenCalledWith( {
      messages: [ callerMessage ],
      abortSignal,
      toolChoice: 'required'
    } );
    expect( aiMocks.superGenerate ).toHaveBeenCalledWith( {
      messages: [
        { role: 'user', content: 'Initial user message' },
        { role: 'assistant', content: 'Stored reply' },
        callerMessage
      ],
      allowSystemInMessages: true,
      abortSignal,
      toolChoice: 'required'
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

    expect( wrapMocks.wrapGeneration ).toHaveBeenCalledWith( {
      name: 'Agent.generate',
      prompt: loadedPrompt,
      fn: expect.any( Function )
    } );
    expect( store.addMessages ).toHaveBeenCalledWith( [
      callerMessage,
      assistantMessage
    ] );
    expect( result ).toBe( aiResponse );
  } );

  it( 'generates with streaming, stores messages, and returns the completed response', async () => {
    const store = {
      getMessages: vi.fn( () => [] ),
      addMessages: vi.fn()
    };
    const callerMessage = { role: 'user', content: 'New question' };
    const output = { summary: 'Structured result' };
    const chunk = { type: 'text-delta', text: 'response' };
    const onChunk = vi.fn();
    const abortSignal = AbortSignal.abort();
    const stream = { output: Promise.resolve( output ) };
    const response = { ...aiResponse };
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
      abortSignal,
      toolChoice: 'required'
    } );

    expect( validations.parseAgentGenerateWithStreamingArgs ).toHaveBeenCalledWith( {
      messages: [ callerMessage ],
      onChunk,
      abortSignal,
      toolChoice: 'required'
    } );
    expect( wrapMocks.wrapGeneration ).toHaveBeenCalledWith( {
      name: 'Agent.generateWithStreaming',
      prompt: loadedPrompt,
      fn: expect.any( Function )
    } );
    expect( aiMocks.superStream ).toHaveBeenCalledWith( {
      messages: [
        { role: 'user', content: 'Initial user message' },
        callerMessage
      ],
      allowSystemInMessages: true,
      onChunk,
      abortSignal,
      toolChoice: 'required',
      onFinish: expect.any( Function ),
      onError: expect.any( Function )
    } );
    expect( streamMocks.drainStream ).toHaveBeenCalledWith( stream, abortSignal );
    expect( store.addMessages ).toHaveBeenCalledWith( [
      callerMessage,
      assistantMessage
    ] );
    expect( onChunk ).toHaveBeenCalledWith( { chunk } );
    expect( result ).toEqual( { ...aiResponse, output } );
  } );

  it( 'omits onChunk when generateWithStreaming does not receive it', async () => {
    const stream = { output: Promise.resolve( undefined ) };
    aiMocks.superStream.mockImplementationOnce( options => {
      options.onFinish( { ...aiResponse } );
      return stream;
    } );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await agent.generateWithStreaming();
    const callOptions = aiMocks.superStream.mock.calls[0][0];

    expect( callOptions ).not.toHaveProperty( 'onChunk' );
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
  } );

  it( 'streams with initial, stored, and caller messages and stores on finish', async () => {
    const store = {
      getMessages: vi.fn( () => [
        { role: 'assistant', content: 'Stored reply' }
      ] ),
      addMessages: vi.fn()
    };
    const onFinish = vi.fn();
    const onError = vi.fn();
    const onChunk = vi.fn();
    const callerMessage = { role: 'user', content: 'New question' };
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );

    const result = await agent.stream( {
      messages: [ callerMessage ],
      onFinish,
      onError,
      onChunk
    } );

    expect( validations.parseAgentStreamArgs ).toHaveBeenCalledWith( {
      messages: [ callerMessage ],
      onFinish,
      onError,
      onChunk
    } );
    expect( wrapMocks.wrapStream ).toHaveBeenCalledWith( {
      name: 'Agent.stream',
      prompt: loadedPrompt,
      fn: expect.any( Function )
    } );
    expect( aiMocks.superStream ).toHaveBeenCalledWith( {
      messages: [
        { role: 'user', content: 'Initial user message' },
        { role: 'assistant', content: 'Stored reply' },
        callerMessage
      ],
      allowSystemInMessages: true,
      onChunk,
      onFinish: expect.any( Function ),
      onError: expect.any( Function )
    } );
    const streamOptions = aiMocks.superStream.mock.calls[0][0];
    await streamOptions.onFinish( aiResponse );
    expect( wrapMocks.streamHooks.onFinishHook ).toHaveBeenCalledWith( aiResponse, expect.any( Function ) );
    expect( store.addMessages ).toHaveBeenCalledWith( [
      callerMessage,
      assistantMessage
    ] );
    expect( onFinish ).toHaveBeenCalledWith( aiResponse );
    expect( result ).toEqual( { textStream: 'stream' } );
  } );

  it( 'does not store stream messages when finishReason is error', async () => {
    const store = {
      getMessages: vi.fn( () => [] ),
      addMessages: vi.fn()
    };
    const onFinish = vi.fn();
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );

    await agent.stream( { onFinish } );
    const streamOptions = aiMocks.superStream.mock.calls[0][0];
    await streamOptions.onFinish( { ...aiResponse, finishReason: 'error' } );

    expect( store.addMessages ).not.toHaveBeenCalled();
    expect( onFinish ).toHaveBeenCalledWith( { ...aiResponse, finishReason: 'error' } );
  } );

  it( 'omits onChunk when stream does not receive it', async () => {
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await agent.stream();
    const callOptions = aiMocks.superStream.mock.calls[0][0];

    expect( callOptions ).not.toHaveProperty( 'onChunk' );
  } );

  it( 'forwards stream onError through wrapStream with the mapped event payload', async () => {
    const onError = vi.fn();
    const error = new Error( 'Stream failed' );
    const mappedError = new Error( 'Mapped stream failed' );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await agent.stream( { onError } );
    const streamOptions = aiMocks.superStream.mock.calls[0][0];
    streamOptions.onError( { error, extra: true } );

    expect( wrapMocks.streamHooks.onErrorHook ).toHaveBeenCalledWith(
      { error, extra: true },
      expect.any( Function )
    );
    wrapMocks.streamHooks.onErrorHook.mock.calls[0][1]( mappedError );
    expect( onError ).toHaveBeenCalledWith( { error: mappedError, extra: true } );
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
