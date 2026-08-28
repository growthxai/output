import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadModelImpl = vi.fn();
const loadImageModelImpl = vi.fn();
const loadPromptToolsImpl = vi.fn();
const buildLoadSkillToolImpl = vi.fn();

vi.mock( './utils/models.js', () => ( {
  loadTextModel: ( ...args ) => loadModelImpl( ...args ),
  loadImageModel: ( ...args ) => loadImageModelImpl( ...args )
} ) );

vi.mock( './utils/tools.js', () => ( {
  buildLoadSkillTool: ( ...args ) => buildLoadSkillToolImpl( ...args ),
  loadPromptTools: ( ...args ) => loadPromptToolsImpl( ...args )
} ) );

vi.mock( 'ai', () => ( {
  stepCountIs: count => ( { type: 'step-count', count } )
} ) );

const importSut = async () => import( './ai_sdk_options.js' );

const makeTextPrompt = config => ( {
  name: 'test@v1',
  config: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    maxSteps: 10,
    ...config
  },
  messages: [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Hello' }
  ],
  instructions: null
} );

const makeImagePrompt = config => ( {
  name: 'image@v1',
  config: {
    provider: 'openai',
    model: 'gpt-image-1',
    ...config
  },
  messages: [],
  instructions: 'Generate a cinematic image of a NASCAR race at sunset.'
} );

const writerSkill = {
  name: 'writer',
  description: 'Writes copy',
  instructions: 'Do it.'
};

const skillsCatalog =
  'Available skills (use load_skill to get full instructions):\n- writer: Writes copy';

describe( 'ai_sdk_options', () => {
  beforeEach( () => {
    vi.resetModules();
    vi.clearAllMocks();
    loadModelImpl.mockReturnValue( 'MODEL' );
    loadImageModelImpl.mockReturnValue( 'IMAGE_MODEL' );
    loadPromptToolsImpl.mockReturnValue( null );
    buildLoadSkillToolImpl.mockImplementation( skills => ( { type: 'load_skill', skills } ) );
  } );

  describe( 'loadAiSdkTextOptions', () => {
    const loadText = async args => {
      const { loadAiSdkTextOptions } = await importSut();
      return loadAiSdkTextOptions( { skills: [], ...args } );
    };

    it( 'maps a loaded prompt to model, system, messages, and generation config', async () => {
      const prompt = makeTextPrompt( {
        temperature: 0.3,
        maxTokens: 1000,
        providerOptions: { anthropic: { effort: 'medium' } }
      } );

      const result = await loadText( { prompt } );

      expect( loadModelImpl ).toHaveBeenCalledWith( prompt );
      expect( loadPromptToolsImpl ).toHaveBeenCalledWith( prompt );
      expect( result ).toEqual( {
        allowSystemInMessages: true,
        maxRetries: 0,
        model: 'MODEL',
        system: [ { role: 'system', content: 'You are concise.' } ],
        messages: [ { role: 'user', content: 'Hello' } ],
        providerOptions: prompt.config.providerOptions,
        temperature: 0.3,
        maxOutputTokens: 1000
      } );
    } );

    it( 'forwards all supported text generation options', async () => {
      const generationOptions = {
        frequencyPenalty: 0.2,
        maxOutputTokens: 2000,
        presencePenalty: 0.3,
        providerOptions: { openai: { reasoningEffort: 'low' } },
        seed: 42,
        stopSequences: [ 'END' ],
        temperature: 0.4,
        topK: 40,
        topP: 0.9
      };

      const result = await loadText( { prompt: makeTextPrompt( generationOptions ) } );

      expect( result ).toMatchObject( generationOptions );
    } );

    it( 'preserves temperature 0', async () => {
      const result = await loadText( { prompt: makeTextPrompt( { temperature: 0 } ) } );

      expect( result.temperature ).toBe( 0 );
    } );

    it( 'throws when the prompt has no chat-style messages', async () => {
      const { loadAiSdkTextOptions } = await importSut();

      expect( () => loadAiSdkTextOptions( { prompt: makeImagePrompt(), skills: [] } ) ).toThrow(
        'Prompt "image@v1" has no chat-style messages.'
      );
      expect( loadModelImpl ).not.toHaveBeenCalled();
      expect( loadPromptToolsImpl ).not.toHaveBeenCalled();
    } );

    it( 'forwards per-message providerOptions when splitting system and messages', async () => {
      const providerOptions = { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } };
      const prompt = {
        name: 'cache@v1',
        config: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5'
        },
        messages: [
          { role: 'system', content: 'Static', providerOptions },
          { role: 'user', content: 'Hello' }
        ],
        instructions: null
      };

      const result = await loadText( { prompt } );

      expect( result.system ).toEqual( [ {
        role: 'system',
        content: 'Static',
        providerOptions
      } ] );
      expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello' } ] );
    } );

    it( 'returns an empty system array when the prompt has no system block', async () => {
      const prompt = {
        name: 'no-system@v1',
        config: { provider: 'anthropic', model: 'claude-haiku-4-5' },
        messages: [ { role: 'user', content: 'Hello' } ],
        instructions: null
      };

      const result = await loadText( { prompt } );

      expect( result.system ).toEqual( [] );
      expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello' } ] );
    } );

    it( 'groups multiple system blocks into system and keeps them out of messages', async () => {
      const prompt = {
        name: 'multi-system@v1',
        config: { provider: 'anthropic', model: 'claude-haiku-4-5' },
        messages: [
          { role: 'system', content: 'First' },
          { role: 'system', content: 'Second' },
          { role: 'user', content: 'Hello' }
        ],
        instructions: null
      };

      const result = await loadText( { prompt } );

      expect( result.system ).toEqual( [
        { role: 'system', content: 'First' },
        { role: 'system', content: 'Second' }
      ] );
      expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello' } ] );
    } );

    it( 'omits tools and stopWhen when no tools are present', async () => {
      const result = await loadText( { prompt: makeTextPrompt() } );

      expect( result.tools ).toBeUndefined();
      expect( result.stopWhen ).toBeUndefined();
      expect( buildLoadSkillToolImpl ).not.toHaveBeenCalled();
    } );

    it( 'sets prompt tools and stopWhen from maxSteps', async () => {
      const promptTools = { googleSearch: { type: 'google-search-tool' } };
      loadPromptToolsImpl.mockReturnValue( promptTools );

      const result = await loadText( { prompt: makeTextPrompt( { tools: { googleSearch: {} }, maxSteps: 4 } ) } );

      expect( result.tools ).toEqual( promptTools );
      expect( result.stopWhen ).toEqual( { type: 'step-count', count: 4 } );
    } );

    it( 'lets caller tools override prompt tools on the same key', async () => {
      loadPromptToolsImpl.mockReturnValue( {
        googleSearch: { from: 'prompt' },
        urlContext: { from: 'prompt' }
      } );

      const result = await loadText( {
        prompt: makeTextPrompt(),
        tools: { googleSearch: { from: 'caller' } }
      } );

      expect( result.tools ).toEqual( {
        googleSearch: { from: 'caller' },
        urlContext: { from: 'prompt' }
      } );
    } );

    it( 'appends the skills catalog to the first system message and adds load_skill', async () => {
      const providerOptions = { anthropic: { cacheControl: { type: 'ephemeral' } } };
      const prompt = makeTextPrompt();
      prompt.messages[0] = { ...prompt.messages[0], providerOptions };

      const result = await loadText( {
        prompt,
        skills: [ writerSkill ]
      } );

      expect( buildLoadSkillToolImpl ).toHaveBeenCalledWith( [ writerSkill ] );
      expect( result.system ).toEqual( [
        { role: 'system', content: `You are concise.\n\n${skillsCatalog}`, providerOptions }
      ] );
      expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello' } ] );
      expect( result.tools ).toEqual( {
        load_skill: { type: 'load_skill', skills: [ writerSkill ] }
      } );
      expect( result.stopWhen ).toEqual( { type: 'step-count', count: 10 } );
    } );

    it( 'adds a system message for the skills catalog when none exists', async () => {
      const prompt = {
        name: 'no-system@v1',
        config: { provider: 'anthropic', model: 'claude-haiku-4-5', maxSteps: 10 },
        messages: [ { role: 'user', content: 'Hello' } ],
        instructions: null
      };

      const result = await loadText( { prompt, skills: [ writerSkill ] } );

      expect( result.system ).toEqual( [ { role: 'system', content: skillsCatalog } ] );
      expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello' } ] );
    } );

    it( 'keeps load_skill when the caller uses the same key', async () => {
      const result = await loadText( {
        prompt: makeTextPrompt(),
        tools: { load_skill: { from: 'caller' }, search: { from: 'caller' } },
        skills: [ writerSkill ]
      } );

      expect( result.tools ).toEqual( {
        load_skill: { type: 'load_skill', skills: [ writerSkill ] },
        search: { from: 'caller' }
      } );
    } );

    it( 'forwards output, abortSignal, and caller stopWhen', async () => {
      const output = { type: 'object' };
      const abortSignal = AbortSignal.abort();
      const stopWhen = { type: 'custom-stop' };

      const result = await loadText( {
        prompt: makeTextPrompt(),
        output,
        abortSignal,
        stopWhen
      } );

      expect( result.output ).toBe( output );
      expect( result.abortSignal ).toBe( abortSignal );
      expect( result.stopWhen ).toBe( stopWhen );
    } );

    it( 'does not replace caller stopWhen with maxSteps when tools are present', async () => {
      loadPromptToolsImpl.mockReturnValue( { googleSearch: { type: 'google-search-tool' } } );
      const stopWhen = { type: 'custom-stop' };

      const result = await loadText( {
        prompt: makeTextPrompt( { maxSteps: 4 } ),
        stopWhen
      } );

      expect( result.stopWhen ).toBe( stopWhen );
    } );

    it( 'sets toolChoice only when tools are present', async () => {
      const withoutTools = await loadText( {
        prompt: makeTextPrompt(),
        toolChoice: 'required'
      } );
      expect( withoutTools.toolChoice ).toBeUndefined();

      loadPromptToolsImpl.mockReturnValue( { googleSearch: { type: 'google-search-tool' } } );
      const withTools = await loadText( {
        prompt: makeTextPrompt(),
        toolChoice: 'required'
      } );
      expect( withTools.toolChoice ).toBe( 'required' );
    } );
  } );

  describe( 'loadAiSdkImageOptions', () => {
    it( 'maps a loaded prompt to image options and ignores text generation config', async () => {
      const images = [ Buffer.from( 'image-bytes' ) ];
      const mask = Buffer.from( 'mask-bytes' );
      const prompt = makeImagePrompt( {
        n: 2,
        maxImagesPerCall: 1,
        size: '1024x1024',
        aspectRatio: '1:1',
        seed: 42,
        temperature: 0.7,
        maxTokens: 1000,
        providerOptions: { openai: { quality: 'high' } }
      } );

      const { loadAiSdkImageOptions } = await importSut();
      const result = loadAiSdkImageOptions( { prompt, images, mask } );

      expect( loadImageModelImpl ).toHaveBeenCalledWith( prompt );
      expect( loadModelImpl ).not.toHaveBeenCalled();
      expect( loadPromptToolsImpl ).not.toHaveBeenCalled();
      expect( result ).toEqual( {
        maxRetries: 0,
        model: 'IMAGE_MODEL',
        prompt: {
          text: 'Generate a cinematic image of a NASCAR race at sunset.',
          images,
          mask
        },
        providerOptions: prompt.config.providerOptions,
        n: 2,
        maxImagesPerCall: 1,
        size: '1024x1024',
        aspectRatio: '1:1',
        seed: 42
      } );
      expect( result.temperature ).toBeUndefined();
      expect( result.maxOutputTokens ).toBeUndefined();
    } );

    it( 'omits undefined image options while preserving explicit 0 seed', async () => {
      const { loadAiSdkImageOptions } = await importSut();
      const result = loadAiSdkImageOptions( { prompt: makeImagePrompt( { seed: 0 } ) } );

      expect( result ).toEqual( {
        maxRetries: 0,
        model: 'IMAGE_MODEL',
        prompt: 'Generate a cinematic image of a NASCAR race at sunset.',
        providerOptions: undefined,
        seed: 0
      } );
    } );

    it( 'throws when the prompt has no instructions', async () => {
      const { loadAiSdkImageOptions } = await importSut();

      expect( () => loadAiSdkImageOptions( { prompt: makeTextPrompt() } ) ).toThrow(
        'Prompt "test@v1" has no instructions.'
      );
      expect( loadImageModelImpl ).not.toHaveBeenCalled();
    } );

    it( 'forwards abortSignal', async () => {
      const abortSignal = AbortSignal.abort();
      const { loadAiSdkImageOptions } = await importSut();
      const result = loadAiSdkImageOptions( { prompt: makeImagePrompt(), abortSignal } );

      expect( result.abortSignal ).toBe( abortSignal );
    } );
  } );
} );
