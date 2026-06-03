import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadPromptImpl = vi.fn();
const resolvePromptSkillsImpl = vi.fn();
const buildLoadSkillToolImpl = vi.fn();
const buildSystemSkillsVarImpl = vi.fn();

vi.mock( './loader.js', () => ( {
  loadPrompt: ( ...args ) => loadPromptImpl( ...args )
} ) );

vi.mock( './skill.js', () => ( {
  resolvePromptSkills: ( ...args ) => resolvePromptSkillsImpl( ...args ),
  buildLoadSkillTool: ( ...args ) => buildLoadSkillToolImpl( ...args ),
  buildSystemSkillsVar: ( ...args ) => buildSystemSkillsVarImpl( ...args )
} ) );

const importSut = async () => import( './prepare_text.js' );

const makePrompt = messages => ( {
  name: 'test@v1',
  config: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  messages,
  promptFileDir: '/prompts'
} );

describe( 'prepareTextPrompt', () => {
  beforeEach( () => {
    vi.resetModules();
    vi.clearAllMocks();
    resolvePromptSkillsImpl.mockReturnValue( [] );
    buildLoadSkillToolImpl.mockReturnValue( { type: 'load-skill-tool' } );
    buildSystemSkillsVarImpl.mockReturnValue( 'Available skills:\n- copy: Copy guidance' );
  } );

  it( 'loads and returns a prompt with caller tools when no skills resolve', async () => {
    const loadedPrompt = makePrompt( [ { role: 'user', content: 'Hello' } ] );
    const tools = { search: { type: 'search-tool' } };
    loadPromptImpl.mockReturnValue( loadedPrompt );

    const { prepareTextPrompt } = await importSut();
    const result = prepareTextPrompt( {
      prompt: 'test@v1',
      variables: { name: 'Ada' },
      promptDir: '/workflow',
      skills: [],
      tools
    } );

    expect( loadPromptImpl ).toHaveBeenCalledWith( 'test@v1', { name: 'Ada' }, '/workflow' );
    expect( resolvePromptSkillsImpl ).toHaveBeenCalledWith( loadedPrompt, [] );
    expect( result ).toEqual( {
      loadedPrompt,
      tools
    } );
    expect( result.tools ).not.toBe( tools );
    expect( buildLoadSkillToolImpl ).not.toHaveBeenCalled();
    expect( buildSystemSkillsVarImpl ).not.toHaveBeenCalled();
  } );

  it( 'returns null tools when no caller tools or skills resolve', async () => {
    const loadedPrompt = makePrompt( [ { role: 'user', content: 'Hello' } ] );
    loadPromptImpl.mockReturnValue( loadedPrompt );

    const { prepareTextPrompt } = await importSut();
    const result = prepareTextPrompt( {
      prompt: 'test@v1',
      variables: {},
      skills: []
    } );

    expect( result ).toEqual( {
      loadedPrompt,
      tools: null
    } );
    expect( buildLoadSkillToolImpl ).not.toHaveBeenCalled();
    expect( buildSystemSkillsVarImpl ).not.toHaveBeenCalled();
  } );

  it( 'adds load_skill and prepends a system message when skills resolve without an existing system message', async () => {
    const loadedPrompt = makePrompt( [ { role: 'user', content: 'Hello' } ] );
    const resolvedSkills = [ { name: 'copy', description: 'Copy guidance', instructions: '# Copy' } ];
    loadPromptImpl.mockReturnValue( loadedPrompt );
    resolvePromptSkillsImpl.mockReturnValue( resolvedSkills );

    const { prepareTextPrompt } = await importSut();
    const result = prepareTextPrompt( {
      prompt: 'test@v1',
      variables: {},
      skills: resolvedSkills
    } );

    expect( buildLoadSkillToolImpl ).toHaveBeenCalledWith( resolvedSkills );
    expect( buildSystemSkillsVarImpl ).toHaveBeenCalledWith( resolvedSkills );
    expect( result.tools.load_skill ).toEqual( { type: 'load-skill-tool' } );
    expect( loadedPrompt.messages ).toEqual( [
      { role: 'system', content: 'Available skills:\n- copy: Copy guidance' },
      { role: 'user', content: 'Hello' }
    ] );
  } );

  it( 'merges skill instructions into an existing system message', async () => {
    const loadedPrompt = makePrompt( [
      { role: 'system', content: 'You are concise.' },
      { role: 'user', content: 'Hello' }
    ] );
    const resolvedSkills = [ { name: 'copy', description: 'Copy guidance', instructions: '# Copy' } ];
    loadPromptImpl.mockReturnValue( loadedPrompt );
    resolvePromptSkillsImpl.mockReturnValue( resolvedSkills );

    const { prepareTextPrompt } = await importSut();
    prepareTextPrompt( {
      prompt: 'test@v1',
      variables: {},
      skills: resolvedSkills
    } );

    expect( loadedPrompt.messages ).toEqual( [
      { role: 'system', content: 'You are concise.\n\nAvailable skills:\n- copy: Copy guidance' },
      { role: 'user', content: 'Hello' }
    ] );
  } );

  it( 'allows caller tools to override the generated load_skill tool', async () => {
    const loadedPrompt = makePrompt( [ { role: 'user', content: 'Hello' } ] );
    const resolvedSkills = [ { name: 'copy', description: 'Copy guidance', instructions: '# Copy' } ];
    const callerLoadSkill = { type: 'caller-load-skill-tool' };
    loadPromptImpl.mockReturnValue( loadedPrompt );
    resolvePromptSkillsImpl.mockReturnValue( resolvedSkills );

    const { prepareTextPrompt } = await importSut();
    const result = prepareTextPrompt( {
      prompt: 'test@v1',
      variables: {},
      skills: resolvedSkills,
      tools: { load_skill: callerLoadSkill }
    } );

    expect( result.tools.load_skill ).toBe( callerLoadSkill );
  } );
} );
