import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadModelImpl = vi.fn();
const loadImageModelImpl = vi.fn();
const loadToolsImpl = vi.fn();

vi.mock( './ai_model.js', () => ( {
  loadTextModel: ( ...args ) => loadModelImpl( ...args ),
  loadImageModel: ( ...args ) => loadImageModelImpl( ...args ),
  loadTools: ( ...args ) => loadToolsImpl( ...args )
} ) );

const importSut = async () => import( './ai_sdk_options.js' );

const makeTextPrompt = config => ( {
  name: 'test@v1',
  config: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
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

describe( 'ai_sdk_options', () => {
  beforeEach( () => {
    vi.resetModules();
    vi.clearAllMocks();
    loadModelImpl.mockReturnValue( 'MODEL' );
    loadImageModelImpl.mockReturnValue( 'IMAGE_MODEL' );
    loadToolsImpl.mockReturnValue( null );
  } );

  it( 'maps loaded prompts to AI SDK text options', async () => {
    const prompt = makeTextPrompt( {
      temperature: 0.3,
      maxTokens: 1000,
      providerOptions: { anthropic: { effort: 'medium' } }
    } );

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( loadModelImpl ).toHaveBeenCalledWith( prompt );
    expect( loadToolsImpl ).toHaveBeenCalledWith( prompt );
    expect( result ).toEqual( {
      model: 'MODEL',
      messages: prompt.messages,
      providerOptions: prompt.config.providerOptions,
      temperature: 0.3,
      maxOutputTokens: 1000
    } );
  } );

  it( 'preserves temperature 0 in text options', async () => {
    const prompt = makeTextPrompt( { temperature: 0 } );

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.temperature ).toBe( 0 );
  } );

  it( 'adds provider tools when prompt config resolves tools', async () => {
    const prompt = makeTextPrompt( { tools: { googleSearch: {} } } );
    const tools = { googleSearch: { type: 'google-search-tool' } };
    loadToolsImpl.mockReturnValue( tools );

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.tools ).toBe( tools );
  } );

  it( 'throws when text options receive a prompt without message blocks', async () => {
    const prompt = makeImagePrompt();

    const { loadAiSdkTextOptions } = await importSut();

    expect( () => loadAiSdkTextOptions( prompt ) ).toThrow(
      'Prompt "image@v1" has no chat-style messages.'
    );
    expect( loadModelImpl ).not.toHaveBeenCalled();
    expect( loadToolsImpl ).not.toHaveBeenCalled();
  } );

  it( 'maps loaded prompts to AI SDK image options', async () => {
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
    expect( loadToolsImpl ).not.toHaveBeenCalled();
    expect( result ).toEqual( {
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
    const prompt = makeImagePrompt( { seed: 0 } );

    const { loadAiSdkImageOptions } = await importSut();
    const result = loadAiSdkImageOptions( { prompt } );

    expect( result ).toEqual( {
      model: 'IMAGE_MODEL',
      prompt: 'Generate a cinematic image of a NASCAR race at sunset.',
      providerOptions: undefined,
      seed: 0
    } );
  } );

  it( 'throws when image options receive a prompt without instructions', async () => {
    const prompt = makeTextPrompt();

    const { loadAiSdkImageOptions } = await importSut();

    expect( () => loadAiSdkImageOptions( { prompt } ) ).toThrow(
      'Prompt "test@v1" has no instructions.'
    );
    expect( loadImageModelImpl ).not.toHaveBeenCalled();
  } );

  it( 'expands the cache shorthand into per-message anthropic cacheControl', async () => {
    const prompt = {
      name: 'cache@v1',
      config: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      messages: [
        { role: 'system', content: 'Static instructions', cache: true },
        { role: 'user', content: 'Hello' }
      ],
      instructions: null
    };

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.messages ).toEqual( [
      {
        role: 'system',
        content: 'Static instructions',
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
      },
      { role: 'user', content: 'Hello' }
    ] );
  } );

  it( 'passes the 1h ttl through the cache shorthand', async () => {
    const prompt = {
      name: 'cache@v1',
      config: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      messages: [
        { role: 'system', content: 'Static', cache: '1h' },
        { role: 'user', content: 'Hello' }
      ],
      instructions: null
    };

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.messages[0].providerOptions ).toEqual( {
      anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } }
    } );
  } );

  it( 'resolves messageOptions set references into per-message providerOptions', async () => {
    const prompt = {
      name: 'opts@v1',
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        messageOptions: { cached: { anthropic: { cacheControl: { type: 'ephemeral' } } } }
      },
      messages: [
        { role: 'system', content: 'Docs', options: [ 'cached' ] },
        { role: 'user', content: 'Question' }
      ],
      instructions: null
    };

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.messages[0] ).toEqual( {
      role: 'system',
      content: 'Docs',
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
    } );
    expect( result.messages[1] ).toEqual( { role: 'user', content: 'Question' } );
  } );

  it( 'resolves the cache shorthand for Claude models on vertex', async () => {
    const prompt = {
      name: 'vertex@v1',
      config: { provider: 'vertex', model: 'claude-sonnet-4@vertex' },
      messages: [
        { role: 'system', content: 'Static', cache: true },
        { role: 'user', content: 'Hello' }
      ],
      instructions: null
    };

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.messages[0].providerOptions ).toEqual( {
      anthropic: { cacheControl: { type: 'ephemeral' } }
    } );
  } );

  it( 'warns and skips the cache shorthand for non-anthropic providers', async () => {
    const warnSpy = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
    const prompt = {
      name: 'openai@v1',
      config: { provider: 'openai', model: 'gpt-4o' },
      messages: [
        { role: 'system', content: 'Static', cache: true },
        { role: 'user', content: 'Hello' }
      ],
      instructions: null
    };

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.messages ).toEqual( [
      { role: 'system', content: 'Static' },
      { role: 'user', content: 'Hello' }
    ] );
    expect( warnSpy ).toHaveBeenCalledWith(
      expect.stringContaining( '"cache" shorthand only supports Anthropic models' )
    );

    warnSpy.mockRestore();
  } );

  it( 'throws when a message references an unknown messageOptions set', async () => {
    const prompt = {
      name: 'bad@v1',
      config: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      messages: [
        { role: 'user', content: 'Hello', options: [ 'missing' ] }
      ],
      instructions: null
    };

    const { loadAiSdkTextOptions } = await importSut();

    expect( () => loadAiSdkTextOptions( prompt ) ).toThrow(
      'Prompt "bad@v1" references unknown messageOptions set "missing"'
    );
  } );
} );
