import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const coreMocks = vi.hoisted( () => {
  class ValidationError extends Error {}
  return { ValidationError };
} );

const state = vi.hoisted( () => ( {
  invocationDir: '/resolved/invocation'
} ) );

const aiMocks = vi.hoisted( () => ( {
  superConstructor: vi.fn(),
  superGenerate: vi.fn(),
  superStream: vi.fn(),
  stepCountIs: vi.fn( count => ( { type: 'step-count', count } ) )
} ) );

const promptMocks = vi.hoisted( () => ( {
  prepareTextPrompt: vi.fn()
} ) );

const optionMocks = vi.hoisted( () => ( {
  loadAiSdkTextOptions: vi.fn()
} ) );

const traceMocks = vi.hoisted( () => ( {
  startTrace: vi.fn(),
  endTraceWithError: vi.fn()
} ) );

const wrapMocks = vi.hoisted( () => ( {
  wrapTextResponse: vi.fn(),
  wrapStreamOnFinishResponse: vi.fn()
} ) );

const skillMocks = vi.hoisted( () => ( {
  skill: vi.fn( ( { name, description, instructions } ) => ( {
    name,
    description: description ?? name,
    instructions
  } ) )
} ) );

vi.mock( '@outputai/core', () => ( {
  ValidationError: coreMocks.ValidationError
} ) );

vi.mock( '@outputai/core/sdk_utils', () => ( {
  resolveInvocationDir: () => state.invocationDir
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

vi.mock( './prompt/prepare_text.js', () => ( {
  prepareTextPrompt: ( ...args ) => promptMocks.prepareTextPrompt( ...args )
} ) );

vi.mock( './ai_sdk_options.js', () => ( {
  loadAiSdkTextOptions: ( ...args ) => optionMocks.loadAiSdkTextOptions( ...args )
} ) );

vi.mock( './utils/trace.js', () => ( {
  startTrace: ( ...args ) => traceMocks.startTrace( ...args ),
  endTraceWithError: ( ...args ) => traceMocks.endTraceWithError( ...args )
} ) );

vi.mock( './utils/response_wrappers.js', () => ( {
  wrapTextResponse: ( ...args ) => wrapMocks.wrapTextResponse( ...args ),
  wrapStreamOnFinishResponse: ( ...args ) =>
    wrapMocks.wrapStreamOnFinishResponse( ...args )
} ) );

vi.mock( './prompt/skill.js', () => ( {
  skill: ( ...args ) => skillMocks.skill( ...args )
} ) );

const importSut = async () => import( './agent.js' );

const loadedPrompt = {
  name: 'test@v1',
  config: { model: 'test-model' },
  messages: [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Initial user message' }
  ]
};

const preparedTools = {
  load_skill: { description: 'Load skill' }
};

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
    state.invocationDir = '/resolved/invocation';

    aiMocks.superConstructor.mockReset();
    aiMocks.superGenerate.mockReset().mockResolvedValue( aiResponse );
    aiMocks.superStream.mockReset().mockReturnValue( { textStream: 'stream' } );
    aiMocks.stepCountIs
      .mockReset()
      .mockImplementation( count => ( { type: 'step-count', count } ) );

    promptMocks.prepareTextPrompt.mockReset().mockReturnValue( {
      loadedPrompt,
      tools: preparedTools
    } );

    optionMocks.loadAiSdkTextOptions.mockReset().mockReturnValue( textOptions );

    traceMocks.startTrace.mockReset().mockReturnValue( 'trace-id' );
    traceMocks.endTraceWithError.mockReset();

    wrapMocks.wrapTextResponse
      .mockReset()
      .mockImplementation( async ( { response } ) => response );
    wrapMocks.wrapStreamOnFinishResponse.mockReset().mockReturnValue( {
      onFinish: vi.fn()
    } );

    skillMocks.skill.mockClear();
  } );

  afterEach( async () => {
    await vi.resetModules();
  } );

  it( 're-exports skill()', async () => {
    const { skill } = await importSut();

    const result = skill( { name: 'writer', instructions: '# Writer' } );

    expect( result ).toEqual( {
      name: 'writer',
      description: 'writer',
      instructions: '# Writer'
    } );
  } );

  it( 'throws when prompt is missing', async () => {
    const { Agent } = await importSut();

    expect( () => new Agent( {} ) ).toThrow( coreMocks.ValidationError );
  } );

  it( 'prepares the prompt using the resolved invocation dir', async () => {
    const { Agent } = await importSut();
    const skills = [
      { name: 'style', description: 'Style', instructions: '# Style' }
    ];
    const tools = { search: { description: 'Search' } };

    new Agent( {
      prompt: 'test@v1',
      variables: { tone: 'brief' },
      skills,
      tools
    } );

    expect( promptMocks.prepareTextPrompt ).toHaveBeenCalledWith( {
      prompt: 'test@v1',
      variables: { tone: 'brief' },
      promptDir: state.invocationDir,
      skills,
      tools
    } );
  } );

  it( 'uses an explicit promptDir when provided', async () => {
    const { Agent } = await importSut();

    new Agent( { prompt: 'test@v1', promptDir: '/explicit/prompts' } );

    expect( promptMocks.prepareTextPrompt ).toHaveBeenCalledWith(
      expect.objectContaining( {
        promptDir: '/explicit/prompts'
      } )
    );
  } );

  it( 'constructs ToolLoopAgent with text options, instructions, tools, and default stopWhen', async () => {
    const { Agent } = await importSut();

    new Agent( { prompt: 'test@v1' } );

    expect( optionMocks.loadAiSdkTextOptions ).toHaveBeenCalledWith( loadedPrompt );
    expect( aiMocks.stepCountIs ).toHaveBeenCalledWith( 10 );
    expect( aiMocks.superConstructor ).toHaveBeenCalledWith( {
      model,
      providerOptions: { test: true },
      temperature: 0.3,
      instructions: [ { role: 'system', content: 'You are concise.' } ],
      tools: preparedTools,
      stopWhen: { type: 'step-count', count: 10 }
    } );
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

  it( 'omits tools when prompt preparation returns null tools', async () => {
    const { Agent } = await importSut();
    promptMocks.prepareTextPrompt.mockReturnValueOnce( {
      loadedPrompt,
      tools: null
    } );

    new Agent( { prompt: 'test@v1' } );

    expect( aiMocks.superConstructor ).toHaveBeenCalledWith( {
      model,
      providerOptions: { test: true },
      temperature: 0.3,
      instructions: [ { role: 'system', content: 'You are concise.' } ],
      stopWhen: { type: 'step-count', count: 10 }
    } );
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
      prompt: 'test@v1'
    } );
    expect( wrapMocks.wrapTextResponse ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
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
      prompt: 'test@v1'
    } );
    expect( wrapMocks.wrapStreamOnFinishResponse ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      modelId: 'test-model',
      onFinish
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
    expect( result ).toEqual( { textStream: 'stream' } );
    expect( store.addMessages ).not.toHaveBeenCalled();
  } );

  it( 'traces stream onError events and calls the user callback', async () => {
    const onError = vi.fn();
    const error = new Error( 'Stream failed' );
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );

    await agent.stream( { onError } );
    const streamOptions = aiMocks.superStream.mock.calls[0][0];
    streamOptions.onError( { error } );

    expect( traceMocks.endTraceWithError ).toHaveBeenCalledWith( {
      traceId: 'trace-id',
      error
    } );
    expect( onError ).toHaveBeenCalledWith( { error } );
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
