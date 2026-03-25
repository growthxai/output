import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
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

const capturedToolCalls = vi.hoisted( () => ( { calls: [] } ) );
vi.mock( 'ai', () => ( {
  tool: vi.fn( def => {
    capturedToolCalls.calls.push( def );
    return { _toolDef: def };
  } ),
  stepCountIs: vi.fn( n => ( { type: 'stepCount', count: n } ) ),
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

const makeSkillFile = ( dir, filename, name, description, instructions ) => {
  const content = `---\nname: ${name}\ndescription: ${description}\n---\n\n${instructions}`;
  writeFileSync( join( dir, filename ), content );
};

const importSut = () => import( './agent.js' );

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach( () => {
  state.promptDir = mkdtempSync( join( tmpdir(), 'agent-test-' ) );
  capturedToolCalls.calls = [];
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
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    expect( () => agent( { prompt: 'test@v1' } ) ).toThrow( /requires a name/ );
  } );

  it( 'throws ValidationError when prompt is missing', async () => {
    const { agent } = await importSut();
    expect( () => agent( { name: 'test_agent' } ) ).toThrow( /requires a prompt/ );
  } );

  it( 'throws FatalError when prompt file is not found', async () => {
    const { agent } = await importSut();
    expect( () => agent( { name: 'test_agent', prompt: 'nonexistent@v1' } ) ).toThrow( /not found/ );
  } );

  it( 'throws FatalError when a skill file declared in prompt frontmatter is missing', async () => {
    makePromptFile( state.promptDir, 'test@v1', [ './skills/missing.md' ] );
    const { agent } = await importSut();
    expect( () => agent( { name: 'test_agent', prompt: 'test@v1' } ) ).toThrow( /not found/ );
  } );

  it( 'throws FatalError when a skill directory declared in prompt frontmatter is missing', async () => {
    makePromptFile( state.promptDir, 'test@v1', [ './skills/' ] );
    const { agent } = await importSut();
    expect( () => agent( { name: 'test_agent', prompt: 'test@v1' } ) ).toThrow( /not found/ );
  } );

  it( 'succeeds with valid prompt and no skills', async () => {
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    expect( () => agent( { name: 'test_agent', prompt: 'test@v1' } ) ).not.toThrow();
  } );

  it( 'succeeds with valid prompt and skill files', async () => {
    const skillsDir = join( state.promptDir, 'skills' );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'research.md', 'research', 'Research skill', '# Research\nDo research' );
    makePromptFile( state.promptDir, 'test@v1', [ './skills/research.md' ] );
    const { agent } = await importSut();
    expect( () => agent( { name: 'test_agent', prompt: 'test@v1' } ) ).not.toThrow();
  } );

  it( 'resolves skill paths relative to the prompt file, not promptDir', async () => {
    // Prompt is in a subdirectory (prompts/), skills are co-located with it (prompts/skills/)
    const promptsDir = join( state.promptDir, 'prompts' );
    const skillsDir = join( promptsDir, 'skills' );
    mkdirSync( promptsDir );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'research.md', 'research', 'Research skill', '# Research' );
    makePromptFile( promptsDir, 'test@v1', [ './skills/' ] );
    const { agent } = await importSut();
    // promptDir points at the parent (state.promptDir), but skills are relative to prompt file
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

  it( 'does not inject _system_skills when no skills', async () => {
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( { topic: 'AI' } );

    const calledWith = generateTextImpl.mock.calls[0][0];
    expect( calledWith.variables ).not.toHaveProperty( '_system_skills' );
  } );

  it( 'does not add load_skill tool when no skills', async () => {
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( { topic: 'AI' } );

    const calledWith = generateTextImpl.mock.calls[0][0];
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
  it( 'injects _system_skills variable with skill names and descriptions', async () => {
    const skillsDir = join( state.promptDir, 'skills' );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'research.md', 'research', 'Structured research approach', '# Research\nDo research' );
    makePromptFile( state.promptDir, 'test@v1', [ './skills/' ] );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( {} );

    const { variables } = generateTextImpl.mock.calls[0][0];
    expect( variables._system_skills ).toContain( 'research' );
    expect( variables._system_skills ).toContain( 'Structured research approach' );
    expect( variables._system_skills ).toContain( 'load_skill' );
  } );

  it( 'adds load_skill tool when skills are present', async () => {
    const skillsDir = join( state.promptDir, 'skills' );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'research.md', 'research', 'Research skill', '# Research' );
    makePromptFile( state.promptDir, 'test@v1', [ './skills/' ] );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( {} );

    const { tools } = generateTextImpl.mock.calls[0][0];
    expect( tools ).toHaveProperty( 'load_skill' );
  } );

  it( 'load_skill tool returns skill instructions for valid name', async () => {
    const skillsDir = join( state.promptDir, 'skills' );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'research.md', 'research', 'Research skill', '# Research\nDetailed instructions' );
    makePromptFile( state.promptDir, 'test@v1', [ './skills/' ] );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( {} );

    const { tools } = generateTextImpl.mock.calls[0][0];
    const result = await tools.load_skill._toolDef.execute( { name: 'research' } );
    expect( result ).toContain( '# Research' );
    expect( result ).toContain( 'Detailed instructions' );
  } );

  it( 'load_skill tool returns error message for unknown skill', async () => {
    const skillsDir = join( state.promptDir, 'skills' );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'research.md', 'research', 'Research skill', '# Research' );
    makePromptFile( state.promptDir, 'test@v1', [ './skills/' ] );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( {} );

    const { tools } = generateTextImpl.mock.calls[0][0];
    const result = await tools.load_skill._toolDef.execute( { name: 'unknown' } );
    expect( result ).toMatch( /not found/ );
    expect( result ).toContain( 'research' );
  } );

  it( 'loads all .md files from a skills directory in sorted order', async () => {
    const skillsDir = join( state.promptDir, 'skills' );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'zzz.md', 'zzz_skill', 'Last skill', '# ZZZ' );
    makeSkillFile( skillsDir, 'aaa.md', 'aaa_skill', 'First skill', '# AAA' );
    makePromptFile( state.promptDir, 'test@v1', [ './skills/' ] );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( {} );

    const { variables } = generateTextImpl.mock.calls[0][0];
    const skillsText = variables._system_skills;
    expect( skillsText.indexOf( 'aaa_skill' ) ).toBeLessThan( skillsText.indexOf( 'zzz_skill' ) );
  } );

  it( 'merges prompt-declared skills with inline agent skills', async () => {
    const skillsDir = join( state.promptDir, 'skills' );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'file_skill.md', 'file_skill', 'From file', '# File' );
    makePromptFile( state.promptDir, 'test@v1', [ './skills/' ] );
    const { agent, skill } = await importSut();
    const inlineSkill = skill( { name: 'inline_skill', description: 'Inline', instructions: '# Inline' } );
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1', skills: [ inlineSkill ] } );

    await testAgent( {} );

    const { variables } = generateTextImpl.mock.calls[0][0];
    expect( variables._system_skills ).toContain( 'file_skill' );
    expect( variables._system_skills ).toContain( 'inline_skill' );
  } );

  it( 'resolves dynamic skills from a function at runtime', async () => {
    makePromptFile( state.promptDir, 'test@v1' );
    const { agent, skill } = await importSut();
    const dynamicSkill = skill( { name: 'dynamic_skill', instructions: '# Dynamic' } );
    const skillsFn = vi.fn( input => input.deep ? [ dynamicSkill ] : [] );
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1', skills: skillsFn } );

    await testAgent( { deep: true } );
    expect( generateTextImpl.mock.calls[0][0].variables._system_skills ).toContain( 'dynamic_skill' );

    generateTextImpl.mockClear();
    await testAgent( { deep: false } );
    expect( generateTextImpl.mock.calls[0][0].variables ).not.toHaveProperty( '_system_skills' );
  } );

  it( 'uses promptDir from options when explicitly provided', async () => {
    const explicitDir = mkdtempSync( join( tmpdir(), 'explicit-dir-' ) );
    makePromptFile( explicitDir, 'test@v1' );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1', promptDir: explicitDir } );

    await testAgent( {} );

    expect( generateTextImpl ).toHaveBeenCalledWith( expect.objectContaining( {
      promptDir: explicitDir
    } ) );
  } );

  it( 'uses maxSteps default of 10 when tools are present', async () => {
    const skillsDir = join( state.promptDir, 'skills' );
    mkdirSync( skillsDir );
    makeSkillFile( skillsDir, 'skill.md', 'skill', 'A skill', '# Skill' );
    makePromptFile( state.promptDir, 'test@v1', [ './skills/' ] );
    const { agent } = await importSut();
    const testAgent = agent( { name: 'test_agent', prompt: 'test@v1' } );

    await testAgent( {} );

    expect( generateTextImpl ).toHaveBeenCalledWith( expect.objectContaining( { stopWhen: { type: 'stepCount', count: 10 } } ) );
  } );
} );
