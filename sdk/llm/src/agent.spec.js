import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const state = vi.hoisted( () => ( { promptDir: '' } ) );

vi.mock( '@outputai/core/sdk_utils', () => ( {
  resolveInvocationDir: () => state.promptDir
} ) );

const generateTextImpl = vi.fn();
vi.mock( './ai_sdk.js', () => ( {
  generateText: ( ...args ) => generateTextImpl( ...args )
} ) );

vi.mock( 'ai', () => ( {
  Output: {
    object: vi.fn( ( { schema } ) => ( { _outputSchema: schema } ) )
  }
} ) );

// ─── Test utilities ───────────────────────────────────────────────────────────

const makePromptFile = ( dir, name, skills = [] ) => {
  const skillsYaml = skills.length > 0 ?
    `skills:\n${skills.map( s => `  - ${s}` ).join( '\n' )}\n` :
    '';
  const messages = '<system>\n{{ _system_skills }}\n</system>\n<user>\ntest\n</user>\n';
  const content = `---\nprovider: anthropic\nmodel: claude-sonnet-4-6\n${skillsYaml}---\n\n${messages}`;
  writeFileSync( join( dir, `${name}.prompt` ), content );
};

const importSut = () => import( './agent.js' );

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach( () => {
  state.promptDir = mkdtempSync( join( tmpdir(), 'agent-test-' ) );
  vi.clearAllMocks();
  generateTextImpl.mockResolvedValue( { result: 'LLM response text' } );
} );

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

describe( 'agent() — runtime behaviour (no skills)', () => {
  it( 'calls generateText with prompt, promptDir, and variables from input', async () => {
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( { topic: 'AI', count: 3 } );

    expect( generateTextImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      prompt: 'test@v1',
      promptDir: state.promptDir,
      variables: { topic: 'AI', count: 3 }
    } ) );
  } );

  it( 'passes empty skills array when no skills', async () => {
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( { topic: 'AI' } );

    const calledWith = generateTextImpl.mock.calls[0][0];
    expect( calledWith.skills ).toEqual( [] );
    expect( calledWith.tools ).toBeUndefined();
  } );

  it( 'returns result.result (text) when no outputSchema', async () => {
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    const result = await testAgent( {} );

    expect( result ).toBe( 'LLM response text' );
  } );

  it( 'returns parsed outputSchema object when outputSchema provided', async () => {
    const { z } = await import( '@outputai/core' );
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    generateTextImpl.mockResolvedValue( { output: { summary: 'Structured output' } } );
    const testAgent = agent( {
      name: 'test_agent',
      prompt: 'test@v1',
      outputSchema: z.object( { summary: z.string() } )
    } );

    const result = await testAgent( {} );

    expect( result ).toEqual( { summary: 'Structured output' } );
  } );

  it( 'passes Output.object to generateText when outputSchema provided', async () => {
    const { z } = await import( '@outputai/core' );
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    generateTextImpl.mockResolvedValue( { output: { summary: 'ok' } } );
    const schema = z.object( { summary: z.string() } );
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1', outputSchema: schema } );

    await testAgent( {} );

    expect( generateTextImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      output: expect.objectContaining( { _outputSchema: schema } )
    } ) );
  } );

  it( 'passes complex input values as JSON strings', async () => {
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( { tags: [ 'a', 'b' ], meta: { key: 'val' } } );

    const { variables } = generateTextImpl.mock.calls[0][0];
    expect( variables.tags ).toBe( '["a","b"]' );
    expect( variables.meta ).toBe( '{"key":"val"}' );
  } );
} );

describe( 'agent() — runtime behaviour (with skills)', () => {
  it( 'passes inline skills array directly to generateText', async () => {
    const { agent, skill } = await importSut();
    const inlineSkill = skill( { name: 'my_skill', description: 'My skill', instructions: '# My Skill' } );
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1', skills: [ inlineSkill ] } );

    await testAgent( {} );

    expect( generateTextImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      skills: [ inlineSkill ]
    } ) );
  } );

  it( 'passes skills function reference directly to generateText', async () => {
    const { agent, skill } = await importSut();
    const dynamicSkill = skill( { name: 'dynamic_skill', instructions: '# Dynamic' } );
    const skillsFn = vars => vars.deep ? [ dynamicSkill ] : [];
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1', skills: skillsFn } );

    await testAgent( { deep: true } );

    expect( generateTextImpl.mock.calls[0][0].skills ).toBe( skillsFn );
  } );

  it( 'uses promptDir from options when explicitly provided', async () => {
    const explicitDir = mkdtempSync( join( tmpdir(), 'explicit-dir-' ) );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1', promptDir: explicitDir } );

    await testAgent( {} );

    expect( generateTextImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      promptDir: explicitDir
    } ) );
  } );

  it( 'passes maxSteps default of 10 to generateText', async () => {
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( {} );

    expect( generateTextImpl ).toHaveBeenCalledWith( expect.objectContaining( { maxSteps: 10 } ) );
  } );
} );
