import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadModelImpl = vi.fn();
const loadImageModelImpl = vi.fn();
const loadToolsImpl = vi.fn();
const resolveModelMaxOutputTokensImpl = vi.fn();
const warnImpl = vi.fn();

vi.mock( './ai_model.js', () => ( {
  loadTextModel: ( ...args ) => loadModelImpl( ...args ),
  loadImageModel: ( ...args ) => loadImageModelImpl( ...args ),
  loadTools: ( ...args ) => loadToolsImpl( ...args )
} ) );

vi.mock( './cost/fetch_models_pricing.js', () => ( {
  resolveModelMaxOutputTokens: ( ...args ) => resolveModelMaxOutputTokensImpl( ...args )
} ) );

vi.mock( '@outputai/core', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    Logger: { ...actual.Logger, createLogger: () => ( { warn: ( ...args ) => warnImpl( ...args ) } ) }
  };
} );

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
    resolveModelMaxOutputTokensImpl.mockReturnValue( { status: 'cold', maxOutputTokens: null } );
    warnImpl.mockReset();
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
      system: [ { role: 'system', content: 'You are concise.' } ],
      messages: [ { role: 'user', content: 'Hello' } ],
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

  it( 'defaults maxOutputTokens to the model limit from models.dev when maxTokens is unset', async () => {
    resolveModelMaxOutputTokensImpl.mockReturnValue( { status: 'known', maxOutputTokens: 8000 } );
    const prompt = makeTextPrompt();

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( resolveModelMaxOutputTokensImpl ).toHaveBeenCalledWith( {
      provider: 'anthropic',
      model: 'claude-haiku-4-5'
    } );
    expect( result.maxOutputTokens ).toBe( 8000 );
    expect( warnImpl ).not.toHaveBeenCalled();
  } );

  it( 'caps the injected model limit at 32000', async () => {
    resolveModelMaxOutputTokensImpl.mockReturnValue( { status: 'known', maxOutputTokens: 64000 } );
    const prompt = makeTextPrompt();

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.maxOutputTokens ).toBe( 32000 );
  } );

  it( 'prefers an explicit maxTokens over the model limit and skips the resolver', async () => {
    const prompt = makeTextPrompt( { maxTokens: 1000 } );

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.maxOutputTokens ).toBe( 1000 );
    expect( resolveModelMaxOutputTokensImpl ).not.toHaveBeenCalled();
  } );

  it( 'leaves maxOutputTokens unset and does not warn when the models table is cold', async () => {
    resolveModelMaxOutputTokensImpl.mockReturnValue( { status: 'cold', maxOutputTokens: null } );
    const prompt = makeTextPrompt();

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.maxOutputTokens ).toBeUndefined();
    expect( warnImpl ).not.toHaveBeenCalled();
  } );

  it( 'warns once per model when the limit is unknown and leaves maxOutputTokens unset', async () => {
    resolveModelMaxOutputTokensImpl.mockReturnValue( { status: 'unknown', maxOutputTokens: null } );
    const prompt = makeTextPrompt( { model: 'claude-sonnet-5' } );

    const { loadAiSdkTextOptions } = await importSut();
    const first = loadAiSdkTextOptions( prompt );
    const second = loadAiSdkTextOptions( prompt );

    expect( first.maxOutputTokens ).toBeUndefined();
    expect( second.maxOutputTokens ).toBeUndefined();
    expect( warnImpl ).toHaveBeenCalledTimes( 1 );
    expect( warnImpl ).toHaveBeenCalledWith( expect.stringContaining( 'anthropic/claude-sonnet-5' ) );
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

  it( 'resolves block attributes into per-message providerOptions', async () => {
    const prompt = {
      name: 'cache@v1',
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        messageOptions: { cached: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } } }
      },
      messages: [
        { role: 'system', content: 'Static', attributes: { options: 'cached' } },
        { role: 'user', content: 'Hello' }
      ],
      instructions: null
    };

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.system ).toEqual( [
      {
        role: 'system',
        content: 'Static',
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } }
      }
    ] );
    expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello' } ] );
  } );

  it( 'returns an empty system array when the prompt has no system block', async () => {
    const prompt = {
      name: 'no-system@v1',
      config: { provider: 'anthropic', model: 'claude-haiku-4-5' },
      messages: [ { role: 'user', content: 'Hello' } ],
      instructions: null
    };

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.system ).toEqual( [] );
    expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello' } ] );
  } );

  it( 'groups multiple system blocks into the system option and keeps them out of messages', async () => {
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

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.system ).toEqual( [
      { role: 'system', content: 'First' },
      { role: 'system', content: 'Second' }
    ] );
    expect( result.messages ).toEqual( [ { role: 'user', content: 'Hello' } ] );
  } );
} );
