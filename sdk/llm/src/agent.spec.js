import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const state = vi.hoisted( () => ( { promptDir: '' } ) );

vi.mock( '@outputai/core/sdk_utils', () => ( {
  resolveInvocationDir: () => state.promptDir
} ) );

const superGenerateImpl = vi.fn();
const superStreamImpl = vi.fn();
const superConstructorSpy = vi.fn();

vi.mock( 'ai', () => {
  class MockToolLoopAgent {
    constructor( options ) {
      superConstructorSpy( options );
    }

    async generate( ...args ) {
      return superGenerateImpl( ...args );
    }

    stream( ...args ) {
      return superStreamImpl( ...args );
    }
  }
  return {
    ToolLoopAgent: MockToolLoopAgent,
    stepCountIs: vi.fn( n => ( { _stepCount: n } ) ),
    tool: vi.fn( def => def )
  };
} );

const hydratePromptTemplateImpl = vi.fn();
const loadAiSdkOptionsImpl = vi.fn();
vi.mock( './ai_sdk.js', () => ( {
  hydratePromptTemplate: ( ...args ) => hydratePromptTemplateImpl( ...args ),
  loadAiSdkOptionsFromPrompt: ( ...args ) => loadAiSdkOptionsImpl( ...args )
} ) );

const loadPromptImpl = vi.fn();
vi.mock( './prompt_loader.js', () => ( {
  loadPrompt: ( ...args ) => loadPromptImpl( ...args )
} ) );

vi.mock( './skill.js', () => ( {
  skill: vi.fn( ( { name, description, instructions } ) => ( { name, description: description ?? name, instructions } ) ),
  buildLoadSkillTool: vi.fn( skills => ( { _loadSkillTool: true, skills } ) )
} ) );

// ─── Defaults ─────────────────────────────────────────────────────────────────

const defaultMessages = [ { role: 'user', content: 'test message' } ];
const defaultPromptMeta = {
  config: { model: 'claude-sonnet-4-6' },
  messages: defaultMessages,
  promptFileDir: '/mock/dir'
};

const importSut = () => import( './agent.js' );

beforeEach( () => {
  state.promptDir = mkdtempSync( join( tmpdir(), 'agent-test-' ) );
  vi.clearAllMocks();

  hydratePromptTemplateImpl.mockReturnValue( {
    loadedPrompt: defaultPromptMeta,
    allVariables: {},
    tools: {}
  } );
  loadPromptImpl.mockReturnValue( defaultPromptMeta );
  loadAiSdkOptionsImpl.mockReturnValue( {
    model: { _modelId: 'claude-sonnet-4-6' },
    messages: defaultMessages
  } );
  superGenerateImpl.mockResolvedValue( { text: 'response', response: { messages: [] } } );
  superStreamImpl.mockReturnValue( { textStream: 'stream' } );
} );

// ─── Tests ────────────────────────────────────────────────────────────────────

describe( 'skill()', () => {
  it( 'creates a skill object with name, description, instructions', async () => {
    const { skill } = await importSut();
    const s = skill( { name: 'my_skill', description: 'Does stuff', instructions: '# Do stuff\nStep 1' } );
    expect( s ).toEqual( { name: 'my_skill', description: 'Does stuff', instructions: '# Do stuff\nStep 1' } );
  } );
} );

describe( 'Agent — construction', () => {
  it( 'throws ValidationError when prompt is missing', async () => {
    const { Agent } = await importSut();
    expect( () => new Agent( {} ) ).toThrow( /requires a prompt/ );
  } );

  it( 'constructs successfully with a prompt', async () => {
    const { Agent } = await importSut();
    expect( () => new Agent( { prompt: 'test@v1' } ) ).not.toThrow();
  } );

  it( 'calls AIToolLoopAgent constructor once at construction time', async () => {
    const { Agent } = await importSut();
    new Agent( { prompt: 'test@v1' } );
    expect( superConstructorSpy ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'passes model and stopWhen to AIToolLoopAgent constructor', async () => {
    const { Agent } = await importSut();
    new Agent( { prompt: 'test@v1' } );
    expect( superConstructorSpy ).toHaveBeenCalledWith( expect.objectContaining( {
      model: expect.objectContaining( { _modelId: 'claude-sonnet-4-6' } ),
      stopWhen: expect.objectContaining( { _stepCount: 10 } )
    } ) );
  } );

  it( 'uses resolveInvocationDir when promptDir not provided', async () => {
    const { Agent } = await importSut();
    new Agent( { prompt: 'test@v1' } );
    expect( hydratePromptTemplateImpl ).toHaveBeenCalledWith( 'test@v1', {}, state.promptDir, [], {} );
  } );

  it( 'uses explicitly provided promptDir', async () => {
    const explicitDir = mkdtempSync( join( tmpdir(), 'explicit-' ) );
    const { Agent } = await importSut();
    new Agent( { prompt: 'test@v1', promptDir: explicitDir } );
    expect( hydratePromptTemplateImpl ).toHaveBeenCalledWith( 'test@v1', {}, explicitDir, [], {} );
  } );

  it( 'passes construction-time variables to hydratePromptTemplate', async () => {
    const { Agent } = await importSut();
    new Agent( { prompt: 'test@v1', variables: { persona: 'writer' } } );
    expect( hydratePromptTemplateImpl ).toHaveBeenCalledWith(
      'test@v1', { persona: 'writer' }, state.promptDir, [], {}
    );
  } );
} );

describe( 'Agent.generate() — variables', () => {
  it( 'uses pre-rendered initialMessages when no variables provided', async () => {
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );
    await agent.generate();
    expect( superGenerateImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      messages: defaultMessages
    } ) );
  } );

  it( 're-renders messages when variables are provided per-call', async () => {
    const perCallMessages = [ { role: 'user', content: 'per-call content' } ];
    loadPromptImpl.mockReturnValue( { ...defaultPromptMeta, messages: perCallMessages } );

    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );
    await agent.generate( { variables: { content: 'article' } } );

    // _renderMessages calls loadPrompt directly for per-call rendering
    expect( loadPromptImpl ).toHaveBeenCalledWith( 'test@v1', { content: 'article' }, state.promptDir );
  } );

  it( 'appends extra messages after prompt messages', async () => {
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );
    const extraMsg = { role: 'assistant', content: 'prior turn' };
    await agent.generate( { messages: [ extraMsg ] } );
    expect( superGenerateImpl ).toHaveBeenCalledWith( {
      messages: [ ...defaultMessages, extraMsg ]
    } );
  } );
} );

describe( 'Agent.generate() — reuse', () => {
  it( 'does not call AIToolLoopAgent constructor again on subsequent generate() calls', async () => {
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );
    expect( superConstructorSpy ).toHaveBeenCalledTimes( 1 );

    await agent.generate();
    await agent.generate();
    await agent.generate();

    expect( superConstructorSpy ).toHaveBeenCalledTimes( 1 );
  } );
} );

describe( 'Agent.generate() — conversation store', () => {
  it( 'does not use store when none provided (stateless)', async () => {
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );
    await agent.generate();
    // No error, no store interaction — just prompt messages
    expect( superGenerateImpl ).toHaveBeenCalledWith( {
      messages: defaultMessages
    } );
  } );

  it( 'loads prior messages from store before calling super.generate', async () => {
    const priorMessages = [ { role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' } ];
    const store = {
      getMessages: vi.fn( () => priorMessages ),
      addMessages: vi.fn()
    };

    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );
    await agent.generate( { messages: [ { role: 'user', content: 'new msg' } ] } );

    expect( store.getMessages ).toHaveBeenCalled();
    expect( superGenerateImpl ).toHaveBeenCalledWith( {
      messages: [ ...defaultMessages, ...priorMessages, { role: 'user', content: 'new msg' } ]
    } );
  } );

  it( 'appends user messages and response messages to store after generate()', async () => {
    const responseMessages = [ { role: 'assistant', content: 'reply' } ];
    superGenerateImpl.mockResolvedValue( { text: 'reply', response: { messages: responseMessages } } );
    const store = {
      getMessages: vi.fn( () => [] ),
      addMessages: vi.fn()
    };

    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );
    await agent.generate( { messages: [ { role: 'user', content: 'ask' } ] } );

    expect( store.addMessages ).toHaveBeenCalledWith( [
      { role: 'user', content: 'ask' },
      { role: 'assistant', content: 'reply' }
    ] );
  } );

  it( 'supports async store methods', async () => {
    const store = {
      getMessages: vi.fn( async () => [] ),
      addMessages: vi.fn( async () => {} )
    };

    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );
    await agent.generate();

    expect( store.getMessages ).toHaveBeenCalled();
    expect( store.addMessages ).toHaveBeenCalled();
  } );
} );

describe( 'createMemoryConversationStore()', () => {
  it( 'starts with empty messages', async () => {
    const { createMemoryConversationStore } = await importSut();
    const store = createMemoryConversationStore();
    expect( store.getMessages() ).toEqual( [] );
  } );

  it( 'accumulates messages across addMessages calls', async () => {
    const { createMemoryConversationStore } = await importSut();
    const store = createMemoryConversationStore();
    store.addMessages( [ { role: 'user', content: 'hi' } ] );
    store.addMessages( [ { role: 'assistant', content: 'hello' } ] );
    expect( store.getMessages() ).toEqual( [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ] );
  } );
} );

describe( 'Agent.stream()', () => {
  it( 'uses pre-rendered messages when no variables provided', async () => {
    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1' } );
    await agent.stream();
    expect( superStreamImpl ).toHaveBeenCalledWith( {
      messages: defaultMessages
    } );
  } );

  it( 'loads prior messages from store', async () => {
    const priorMessages = [ { role: 'user', content: 'old' } ];
    const store = {
      getMessages: vi.fn( () => priorMessages ),
      addMessages: vi.fn()
    };

    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );
    await agent.stream( { messages: [ { role: 'user', content: 'new' } ] } );

    expect( superStreamImpl ).toHaveBeenCalledWith( {
      messages: [ ...defaultMessages, ...priorMessages, { role: 'user', content: 'new' } ]
    } );
  } );

  it( 'does not auto-append to store', async () => {
    const store = {
      getMessages: vi.fn( () => [] ),
      addMessages: vi.fn()
    };

    const { Agent } = await importSut();
    const agent = new Agent( { prompt: 'test@v1', conversationStore: store } );
    await agent.stream();

    expect( store.addMessages ).not.toHaveBeenCalled();
  } );
} );
