import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const state = vi.hoisted( () => ( { promptDir: '' } ) );

vi.mock( '@outputai/core/sdk_utils', () => ( {
  resolveInvocationDir: () => state.promptDir
} ) );

const generateImpl = vi.fn();
const ToolLoopAgentImpl = vi.fn( () => ( { generate: generateImpl } ) );
vi.mock( './tool_loop_agent.js', () => ( {
  ToolLoopAgent: ( ...args ) => ToolLoopAgentImpl( ...args )
} ) );

vi.mock( 'ai', () => ( {
  Output: {
    object: vi.fn( ( { schema } ) => ( { _outputSchema: schema } ) )
  }
} ) );

// ─── Setup ────────────────────────────────────────────────────────────────────

const importSut = () => import( './agent.js' );

beforeEach( () => {
  state.promptDir = mkdtempSync( join( tmpdir(), 'agent-test-' ) );
  vi.clearAllMocks();
  generateImpl.mockResolvedValue( { text: 'LLM response text' } );
  ToolLoopAgentImpl.mockReturnValue( { generate: generateImpl } );
} );

// ─── Tests ────────────────────────────────────────────────────────────────────

describe( 'skill()', () => {
  it( 'creates a skill object with name, description, instructions', async () => {
    const { skill } = await importSut();
    const s = skill( { name: 'my_skill', description: 'Does stuff', instructions: '# Do stuff\nStep 1' } );
    expect( s ).toEqual( { name: 'my_skill', description: 'Does stuff', instructions: '# Do stuff\nStep 1' } );
  } );

  it( 'defaults description to name when not provided', async () => {
    const { skill } = await importSut();
    const s = skill( { name: 'my_skill', instructions: 'Do stuff' } );
    expect( s.description ).toBe( 'my_skill' );
  } );

  it( 'throws ValidationError when name is missing', async () => {
    const { skill } = await importSut();
    expect( () => skill( { instructions: 'stuff' } ) ).toThrow( /requires a name/ );
  } );

  it( 'throws ValidationError when instructions are missing', async () => {
    const { skill } = await importSut();
    expect( () => skill( { name: 'my_skill' } ) ).toThrow( /requires instructions/ );
  } );
} );

describe( 'agent() — definition-time validation', () => {
  it( 'throws ValidationError when name is missing', async () => {
    const { agent } = await importSut();
    expect( () => agent( { prompt: 'test@v1' } ) ).toThrow( /requires a name/ );
  } );

  it( 'throws ValidationError when prompt is missing', async () => {
    const { agent } = await importSut();
    expect( () => agent( { name: 'test_agent' } ) ).toThrow( /requires a prompt/ );
  } );

  it( 'creates successfully with name and prompt', async () => {
    const { agent } = await importSut();
    expect( () => agent( { name: 'test_agent', prompt: 'test@v1' } ) ).not.toThrow();
  } );
} );

describe( 'agent() — ToolLoopAgent construction', () => {
  it( 'creates ToolLoopAgent with prompt, promptDir, and default maxSteps', async () => {
    const { agent } = await importSut();
    agent( { name: 'test_agent', prompt: 'test@v1' } );

    expect( ToolLoopAgentImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      prompt: 'test@v1',
      promptDir: state.promptDir,
      maxSteps: 10
    } ) );
  } );

  it( 'passes inline skills array to ToolLoopAgent', async () => {
    const { agent, skill } = await importSut();
    const inlineSkill = skill( { name: 'my_skill', description: 'My skill', instructions: '# My Skill' } );
    agent( { name: 'test_agent', prompt: 'test@v1', skills: [ inlineSkill ] } );

    expect( ToolLoopAgentImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      skills: [ inlineSkill ]
    } ) );
  } );

  it( 'passes skills function reference to ToolLoopAgent', async () => {
    const { agent, skill } = await importSut();
    const dynamicSkill = skill( { name: 'dynamic_skill', instructions: '# Dynamic' } );
    const skillsFn = vars => vars.deep ? [ dynamicSkill ] : [];
    agent( { name: 'test_agent', prompt: 'test@v1', skills: skillsFn } );

    expect( ToolLoopAgentImpl.mock.calls[0][0].skills ).toBe( skillsFn );
  } );

  it( 'wraps outputSchema in Output.object and passes to ToolLoopAgent', async () => {
    const { z } = await import( '@outputai/core' );
    const { agent } = await importSut();
    const schema = z.object( { summary: z.string() } );
    agent( { name: 'test_agent', prompt: 'test@v1', outputSchema: schema } );

    expect( ToolLoopAgentImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      output: expect.objectContaining( { _outputSchema: schema } )
    } ) );
  } );

  it( 'uses explicitly provided promptDir', async () => {
    const explicitDir = mkdtempSync( join( tmpdir(), 'explicit-dir-' ) );
    const { agent } = await importSut();
    agent( { name: 'test_agent', prompt: 'test@v1', promptDir: explicitDir } );

    expect( ToolLoopAgentImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      promptDir: explicitDir
    } ) );
  } );
} );

describe( 'agent() — runtime behaviour', () => {
  it( 'calls inner.generate with variables from input', async () => {
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( { topic: 'AI', count: 3 } );

    expect( generateImpl ).toHaveBeenCalledWith( { variables: { topic: 'AI', count: 3 } } );
  } );

  it( 'calls inner.generate with empty object when input is undefined', async () => {
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( undefined );

    expect( generateImpl ).toHaveBeenCalledWith( { variables: undefined } );
  } );
} );
