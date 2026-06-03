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

const makePrompt = config => ( {
  name: 'test@v1',
  config: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    ...config
  },
  messages: [
    { role: 'system', content: 'You are concise.' },
    { role: 'user', content: 'Hello' }
  ]
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
    const prompt = makePrompt( {
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
    const prompt = makePrompt( { temperature: 0 } );

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.temperature ).toBe( 0 );
  } );

  it( 'adds provider tools when prompt config resolves tools', async () => {
    const prompt = makePrompt( { tools: { googleSearch: {} } } );
    const tools = { googleSearch: { type: 'google-search-tool' } };
    loadToolsImpl.mockReturnValue( tools );

    const { loadAiSdkTextOptions } = await importSut();
    const result = loadAiSdkTextOptions( prompt );

    expect( result.tools ).toBe( tools );
  } );

  it( 'maps loaded prompts to AI SDK image options', async () => {
    const prompt = makePrompt( {
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
    const result = loadAiSdkImageOptions( prompt );

    expect( loadImageModelImpl ).toHaveBeenCalledWith( prompt );
    expect( loadModelImpl ).not.toHaveBeenCalled();
    expect( loadToolsImpl ).not.toHaveBeenCalled();
    expect( result ).toEqual( {
      model: 'IMAGE_MODEL',
      prompt: 'You are concise.\n\nHello',
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
    const prompt = makePrompt( { seed: 0 } );

    const { loadAiSdkImageOptions } = await importSut();
    const result = loadAiSdkImageOptions( prompt );

    expect( result ).toEqual( {
      model: 'IMAGE_MODEL',
      prompt: 'You are concise.\n\nHello',
      providerOptions: undefined,
      seed: 0
    } );
  } );
} );
