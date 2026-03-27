import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const state = vi.hoisted( () => ( { promptDir: '' } ) );

vi.mock( '@outputai/core/sdk_utils', () => ( {
  resolveInvocationDir: () => state.promptDir
} ) );

// Track AI.ToolLoopAgent constructor calls and the mock generate/stream methods
const generateImpl = vi.fn();
const streamImpl = vi.fn();
const AiToolLoopAgentImpl = vi.fn( () => ( {
  generate: generateImpl,
  stream: streamImpl
} ) );

vi.mock( 'ai', () => ( {
  ToolLoopAgent: class {
    constructor( ...args ) {
      return AiToolLoopAgentImpl( ...args );
    }
  },
  stepCountIs: vi.fn( n => ( { _stepCount: n } ) ),
  tool: vi.fn( def => def )
} ) );

vi.mock( './ai_sdk.js', () => ( {
  hydratePromptTemplate: vi.fn( ( _prompt, variables, _promptDir, callerSkills ) => ( {
    loadedPrompt: {
      config: { model: 'claude-sonnet-4-6' },
      messages: [ { role: 'user', content: 'test message' } ]
    },
    resolvedSkills: callerSkills,
    allVariables: variables
  } ) ),
  loadAiSdkOptionsFromPrompt: vi.fn( loadedPrompt => ( {
    model: { _modelId: loadedPrompt.config.model },
    messages: loadedPrompt.messages
  } ) )
} ) );

vi.mock( './skill.js', () => ( {
  buildLoadSkillTool: vi.fn( skills => ( { _loadSkillTool: true, skills } ) )
} ) );

// ─── Test utilities ───────────────────────────────────────────────────────────

const importSut = () => import( './tool_loop_agent.js' );

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach( () => {
  state.promptDir = mkdtempSync( join( tmpdir(), 'tla-test-' ) );
  vi.clearAllMocks();
  generateImpl.mockResolvedValue( { text: 'response', output: null } );
  AiToolLoopAgentImpl.mockReturnValue( { generate: generateImpl, stream: streamImpl } );
} );

describe( 'ToolLoopAgent() — construction validation', () => {
  it( 'throws ValidationError when prompt is missing', async () => {
    const { ToolLoopAgent } = await importSut();
    expect( () => ToolLoopAgent( {} ) ).toThrow( /requires a prompt/ );
  } );

  it( 'returns an object with generate and stream methods', async () => {
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1' } );
    expect( agent ).toHaveProperty( 'generate' );
    expect( agent ).toHaveProperty( 'stream' );
  } );

  it( 'uses resolveInvocationDir when promptDir not provided', async () => {
    const { hydratePromptTemplate } = await import( './ai_sdk.js' );
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1' } );
    await agent.generate( {} );
    expect( hydratePromptTemplate ).toHaveBeenCalledWith(
      'test@v1', undefined, state.promptDir, []
    );
  } );

  it( 'uses explicitly provided promptDir', async () => {
    const { hydratePromptTemplate } = await import( './ai_sdk.js' );
    const explicitDir = mkdtempSync( join( tmpdir(), 'explicit-' ) );
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1', promptDir: explicitDir } );
    await agent.generate( {} );
    expect( hydratePromptTemplate ).toHaveBeenCalledWith(
      'test@v1', undefined, explicitDir, []
    );
  } );

  it( 'defaults stopWhen to stepCountIs(10)', async () => {
    const { stepCountIs } = await import( 'ai' );
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1' } );
    await agent.generate( {} );
    expect( stepCountIs ).toHaveBeenCalledWith( 10 );
    expect( AiToolLoopAgentImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      stopWhen: expect.objectContaining( { _stepCount: 10 } )
    } ) );
  } );

  it( 'uses provided maxSteps for default stopWhen', async () => {
    const { stepCountIs } = await import( 'ai' );
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1', maxSteps: 5 } );
    await agent.generate( {} );
    expect( stepCountIs ).toHaveBeenCalledWith( 5 );
  } );

  it( 'uses provided stopWhen directly without calling stepCountIs', async () => {
    const { stepCountIs } = await import( 'ai' );
    const customStop = { _custom: true };
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1', stopWhen: customStop } );
    await agent.generate( {} );
    expect( stepCountIs ).not.toHaveBeenCalled();
    expect( AiToolLoopAgentImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      stopWhen: customStop
    } ) );
  } );
} );

describe( 'ToolLoopAgent().generate()', () => {
  it( 'passes rendered messages to AI.ToolLoopAgent.generate', async () => {
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1' } );
    await agent.generate( { variables: { topic: 'AI' } } );
    expect( generateImpl ).toHaveBeenCalledWith( {
      messages: [ { role: 'user', content: 'test message' } ]
    } );
  } );

  it( 'appends extra messages after prompt messages', async () => {
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1' } );
    const extraMsg = { role: 'assistant', content: 'prior turn' };
    await agent.generate( { messages: [ extraMsg ] } );
    expect( generateImpl ).toHaveBeenCalledWith( {
      messages: [ { role: 'user', content: 'test message' }, extraMsg ]
    } );
  } );

  it( 'adds load_skill tool when skills provided', async () => {
    const { buildLoadSkillTool } = await import( './skill.js' );
    const { ToolLoopAgent } = await importSut();
    const mySkill = { name: 'my_skill', description: 'Desc', instructions: '# Instructions' };
    const agent = ToolLoopAgent( { prompt: 'test@v1', skills: [ mySkill ] } );
    await agent.generate( {} );
    expect( buildLoadSkillTool ).toHaveBeenCalledWith( [ mySkill ] );
    expect( AiToolLoopAgentImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      tools: expect.objectContaining( { load_skill: expect.anything() } )
    } ) );
  } );

  it( 'resolves async skill functions before building inner agent', async () => {
    const { ToolLoopAgent } = await importSut();
    const mySkill = { name: 'async_skill', description: 'Async', instructions: '# Async' };
    const skillsFn = async () => [ mySkill ];
    const agent = ToolLoopAgent( { prompt: 'test@v1', skills: skillsFn } );
    await agent.generate( { variables: {} } );
    // hydratePromptTemplate should be called with the resolved skills array
    const { hydratePromptTemplate } = await import( './ai_sdk.js' );
    expect( hydratePromptTemplate ).toHaveBeenCalledWith(
      'test@v1', {}, state.promptDir, [ mySkill ]
    );
  } );

  it( 'passes callOptions through to AI.ToolLoopAgent.generate', async () => {
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1' } );
    const abortSignal = new AbortController().signal;
    await agent.generate( { variables: {}, abortSignal } );
    expect( generateImpl ).toHaveBeenCalledWith( expect.objectContaining( { abortSignal } ) );
  } );

  it( 'passes output option to AI.ToolLoopAgent constructor', async () => {
    const { ToolLoopAgent } = await importSut();
    const outputSpec = { _outputSchema: {} };
    const agent = ToolLoopAgent( { prompt: 'test@v1', output: outputSpec } );
    await agent.generate( {} );
    expect( AiToolLoopAgentImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      output: outputSpec
    } ) );
  } );
} );

describe( 'ToolLoopAgent().stream()', () => {
  it( 'throws ValidationError when skills is a function', async () => {
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1', skills: () => [] } );
    expect( () => agent.stream( {} ) ).toThrow( /does not support async skill functions/ );
  } );

  it( 'calls AI.ToolLoopAgent.stream with rendered messages', async () => {
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1' } );
    agent.stream( { variables: { topic: 'AI' } } );
    expect( streamImpl ).toHaveBeenCalledWith( {
      messages: [ { role: 'user', content: 'test message' } ]
    } );
  } );

  it( 'appends extra messages after prompt messages', async () => {
    const { ToolLoopAgent } = await importSut();
    const agent = ToolLoopAgent( { prompt: 'test@v1' } );
    const extraMsg = { role: 'assistant', content: 'prior turn' };
    agent.stream( { messages: [ extraMsg ] } );
    expect( streamImpl ).toHaveBeenCalledWith( {
      messages: [ { role: 'user', content: 'test message' }, extraMsg ]
    } );
  } );
} );
