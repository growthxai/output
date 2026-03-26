import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const tracingSpies = {
  addEventStart: vi.fn(),
  addEventEnd: vi.fn(),
  addEventError: vi.fn()
};
const emitEventSpy = vi.fn();
vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: tracingSpies,
  emitEvent: emitEventSpy
} ), { virtual: true } );

const loadModelImpl = vi.fn();
const loadToolsImpl = vi.fn();
vi.mock( './ai_model.js', () => ( {
  loadModel: ( ...values ) => loadModelImpl( ...values ),
  loadTools: ( ...values ) => loadToolsImpl( ...values )
} ) );

const aiFns = {
  generateText: vi.fn(),
  streamText: vi.fn(),
  tool: vi.fn( def => def ),
  stepCountIs: vi.fn( n => ( { type: 'stepCount', count: n } ) )
};
vi.mock( 'ai', () => ( aiFns ) );

const validators = {
  validateGenerateTextArgs: vi.fn(),
  validateStreamTextArgs: vi.fn()
};
vi.mock( './validations.js', () => ( validators ) );

const loadPromptImpl = vi.fn();
vi.mock( './prompt_loader.js', () => ( {
  loadPrompt: ( ...values ) => loadPromptImpl( ...values )
} ) );

const loadPromptSkillsImpl = vi.fn();
vi.mock( './skill.js', async importOriginal => {
  const original = await importOriginal();
  return { ...original, loadPromptSkills: ( ...args ) => loadPromptSkillsImpl( ...args ) };
} );

const extractSourcesFromStepsImpl = vi.fn().mockReturnValue( [] );
vi.mock( './source_extraction.js', () => ( {
  extractSourcesFromSteps: ( ...args ) => extractSourcesFromStepsImpl( ...args )
} ) );

const calculateLLMCallCostImpl = vi.fn();
vi.mock( './cost/index.js', () => ( {
  calculateLLMCallCost: ( ...args ) => calculateLLMCallCostImpl( ...args )
} ) );

const importSut = async () => import( './ai_sdk.js' );

const basePrompt = {
  config: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    providerOptions: { thinking: { enabled: true } }
  },
  messages: [ { role: 'user', content: 'Hi' } ]
};

const cost = 'calculate cost';

beforeEach( () => {
  emitEventSpy.mockReset();
  loadModelImpl.mockReset().mockReturnValue( 'MODEL' );
  loadPromptImpl.mockReset().mockReturnValue( basePrompt );
  extractSourcesFromStepsImpl.mockReset().mockReturnValue( [] );
  calculateLLMCallCostImpl.mockReset().mockResolvedValue( cost );
  aiFns.tool.mockReset().mockImplementation( def => def );
  aiFns.stepCountIs.mockReset().mockImplementation( n => ( { type: 'stepCount', count: n } ) );
  loadPromptSkillsImpl.mockReset().mockReturnValue( [] );

  const defaultUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
  aiFns.generateText.mockReset().mockResolvedValue( {
    text: 'TEXT',
    sources: [],
    usage: defaultUsage,
    totalUsage: defaultUsage,
    finishReason: 'stop'
  } );

  aiFns.streamText.mockReset().mockReturnValue( {
    textStream: 'MOCK_TEXT_STREAM',
    fullStream: 'MOCK_FULL_STREAM',
    text: Promise.resolve( 'STREAMED_TEXT' ),
    usage: Promise.resolve( { inputTokens: 10, outputTokens: 5, totalTokens: 15 } ),
    finishReason: Promise.resolve( 'stop' ),
    sources: Promise.resolve( [] )
  } );
} );

afterEach( async () => {
  await vi.resetModules();
  vi.clearAllMocks();
} );

describe( 'ai_sdk', () => {
  it( 'generateText: validates, traces, calls AI and returns text', async () => {
    const { generateText } = await importSut();
    const result = await generateText( { prompt: 'test_prompt@v1' } );

    expect( validators.validateGenerateTextArgs ).toHaveBeenCalledWith( { prompt: 'test_prompt@v1' } );
    expect( loadPromptImpl ).toHaveBeenCalledWith( 'test_prompt@v1', undefined );
    expect( tracingSpies.addEventStart ).toHaveBeenCalledTimes( 1 );
    expect( tracingSpies.addEventEnd ).toHaveBeenCalledTimes( 1 );
    expect( tracingSpies.addEventEnd ).toHaveBeenCalledWith(
      expect.objectContaining( { details: expect.objectContaining( { cost } ) } )
    );
    expect( calculateLLMCallCostImpl ).toHaveBeenCalledWith( {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      modelId: basePrompt.config.model
    } );
    const defaultUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    expect( emitEventSpy ).toHaveBeenCalledTimes( 1 );
    expect( emitEventSpy ).toHaveBeenCalledWith( 'llm:call_cost', {
      modelId: basePrompt.config.model,
      cost,
      usage: defaultUsage
    } );

    expect( loadModelImpl ).toHaveBeenCalledWith( basePrompt );
    expect( aiFns.generateText ).toHaveBeenCalledWith( {
      model: 'MODEL',
      messages: basePrompt.messages,
      temperature: 0.3,
      providerOptions: basePrompt.config.providerOptions
    } );
    expect( result.text ).toBe( 'TEXT' );
    expect( result.sources ).toEqual( [] );
    expect( result.usage ).toEqual( { inputTokens: 10, outputTokens: 5, totalTokens: 15 } );
    expect( result.finishReason ).toBe( 'stop' );
  } );

  it( 'generateText: passes provider-specific options to AI SDK', async () => {
    const promptWithProviderOptions = {
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        providerOptions: {
          thinking: {
            type: 'enabled',
            budgetTokens: 5000
          },
          anthropic: {
            effort: 'medium',
            customOption: 'value'
          },
          customField: 'should-be-passed'
        }
      },
      messages: [ { role: 'user', content: 'Test' } ]
    };
    loadPromptImpl.mockReturnValueOnce( promptWithProviderOptions );

    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1' } );

    expect( aiFns.generateText ).toHaveBeenCalledWith( {
      model: 'MODEL',
      messages: promptWithProviderOptions.messages,
      providerOptions: {
        thinking: {
          type: 'enabled',
          budgetTokens: 5000
        },
        anthropic: {
          effort: 'medium',
          customOption: 'value'
        },
        customField: 'should-be-passed'
      }
    } );
  } );

  it( 'generateText: passes through providerMetadata', async () => {
    const usageProvider = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    aiFns.generateText.mockResolvedValueOnce( {
      text: 'TEXT',
      sources: [],
      usage: usageProvider,
      totalUsage: usageProvider,
      finishReason: 'stop',
      providerMetadata: { anthropic: { cacheReadInputTokens: 50 } }
    } );

    const { generateText } = await importSut();
    const result = await generateText( { prompt: 'test_prompt@v1' } );

    expect( result.providerMetadata ).toEqual( { anthropic: { cacheReadInputTokens: 50 } } );
  } );

  it( 'generateText: passes through warnings and response metadata', async () => {
    const usageWarnings = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    aiFns.generateText.mockResolvedValueOnce( {
      text: 'TEXT',
      sources: [],
      usage: usageWarnings,
      totalUsage: usageWarnings,
      finishReason: 'stop',
      warnings: [ { type: 'other', message: 'Test warning' } ],
      response: { id: 'req_123', modelId: 'gpt-4o-2024-05-13' }
    } );

    const { generateText } = await importSut();
    const result = await generateText( { prompt: 'test_prompt@v1' } );

    expect( result.warnings ).toEqual( [ { type: 'other', message: 'Test warning' } ] );
    expect( result.response ).toEqual( { id: 'req_123', modelId: 'gpt-4o-2024-05-13' } );
  } );

  it( 'generateText: includes unified result field that matches text', async () => {
    const { generateText } = await importSut();
    const response = await generateText( { prompt: 'test_prompt@v1' } );

    expect( response.result ).toBe( 'TEXT' );
    expect( response.result ).toBe( response.text );
  } );

  it( 'generateText: traces error and rethrows when AI SDK fails', async () => {
    const error = new Error( 'API rate limit exceeded' );
    aiFns.generateText.mockRejectedValueOnce( error );
    const { generateText } = await importSut();

    await expect( generateText( { prompt: 'test_prompt@v1' } ) ).rejects.toThrow( 'API rate limit exceeded' );
    expect( tracingSpies.addEventError ).toHaveBeenCalledWith(
      expect.objectContaining( { details: error } )
    );
  } );

  it( 'generateText: Proxy correctly handles AI SDK response with getter', async () => {
    const responseWithGetter = {
      _internalText: 'TEXT_FROM_GETTER',
      get text() {
        return this._internalText;
      },
      sources: [],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: 'stop'
    };
    aiFns.generateText.mockResolvedValueOnce( responseWithGetter );

    const { generateText } = await importSut();
    const response = await generateText( { prompt: 'test_prompt@v1' } );

    expect( response.text ).toBe( 'TEXT_FROM_GETTER' );
    expect( response.result ).toBe( 'TEXT_FROM_GETTER' );
  } );

  it( 'generateText: passes through AI SDK options like tools and maxRetries', async () => {
    const { generateText } = await importSut();
    const mockTools = { calculator: { description: 'A calculator tool' } };

    await generateText( {
      prompt: 'test_prompt@v1',
      tools: mockTools,
      toolChoice: 'required',
      maxRetries: 5,
      seed: 42
    } );

    expect( aiFns.generateText ).toHaveBeenCalledWith(
      expect.objectContaining( {
        tools: mockTools,
        toolChoice: 'required',
        maxRetries: 5,
        seed: 42
      } )
    );
  } );

  it( 'generateText: user-provided temperature overrides prompt temperature', async () => {
    loadPromptImpl.mockReturnValueOnce( {
      config: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.7
      },
      messages: [ { role: 'user', content: 'Hi' } ]
    } );

    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', temperature: 0.2 } );

    expect( aiFns.generateText ).toHaveBeenCalledWith(
      expect.objectContaining( { temperature: 0.2 } )
    );
  } );

  it( 'generateText: passes through temperature: 0 from prompt', async () => {
    loadPromptImpl.mockReturnValueOnce( {
      config: {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0
      },
      messages: [ { role: 'user', content: 'Hi' } ]
    } );

    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1' } );

    expect( aiFns.generateText ).toHaveBeenCalledWith(
      expect.objectContaining( { temperature: 0 } )
    );
  } );

  it( 'generateText: .object returns undefined instead of leaking text', async () => {
    const { generateText } = await importSut();
    const result = await generateText( { prompt: 'test_prompt@v1' } );

    expect( result.object ).toBeUndefined();
    expect( result.text ).toBe( 'TEXT' );
    expect( result.result ).toBe( 'TEXT' );
  } );

  it( 'generateText: passes through unknown future options for forward compatibility', async () => {
    const { generateText } = await importSut();

    await generateText( {
      prompt: 'test_prompt@v1',
      experimental_futureOption: { key: 'value' },
      unknownOption: true
    } );

    expect( aiFns.generateText ).toHaveBeenCalledWith(
      expect.objectContaining( {
        experimental_futureOption: { key: 'value' },
        unknownOption: true
      } )
    );
  } );

  it( 'streamText: validates, traces, calls AI streamText and returns stream result', async () => {
    const { streamText } = await importSut();
    const result = streamText( { prompt: 'test_prompt@v1' } );

    expect( validators.validateStreamTextArgs ).toHaveBeenCalledWith( { prompt: 'test_prompt@v1' } );
    expect( loadPromptImpl ).toHaveBeenCalledWith( 'test_prompt@v1', undefined );
    expect( tracingSpies.addEventStart ).toHaveBeenCalledTimes( 1 );

    expect( loadModelImpl ).toHaveBeenCalledWith( basePrompt );
    expect( aiFns.streamText ).toHaveBeenCalledWith(
      expect.objectContaining( {
        model: 'MODEL',
        messages: basePrompt.messages,
        temperature: 0.3,
        providerOptions: basePrompt.config.providerOptions,
        onFinish: expect.any( Function ),
        onError: expect.any( Function )
      } )
    );
    expect( result.textStream ).toBe( 'MOCK_TEXT_STREAM' );
    expect( result.fullStream ).toBe( 'MOCK_FULL_STREAM' );
  } );

  it( 'streamText: onFinish callback traces end event and calls user callback', async () => {
    const { streamText } = await importSut();
    const userOnFinish = vi.fn();

    streamText( { prompt: 'test_prompt@v1', onFinish: userOnFinish } );

    const callArgs = aiFns.streamText.mock.calls[0][0];
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const finishEvent = {
      text: 'STREAMED_TEXT',
      usage,
      totalUsage: usage,
      providerMetadata: { anthropic: { cacheReadInputTokens: 50 } },
      finishReason: 'stop'
    };
    await callArgs.onFinish( finishEvent );

    expect( emitEventSpy ).toHaveBeenCalledTimes( 1 );
    expect( emitEventSpy ).toHaveBeenCalledWith( 'llm:call_cost', {
      modelId: basePrompt.config.model,
      cost,
      usage
    } );
    expect( tracingSpies.addEventEnd ).toHaveBeenCalledWith(
      expect.objectContaining( {
        details: {
          result: 'STREAMED_TEXT',
          usage,
          cost,
          providerMetadata: finishEvent.providerMetadata
        }
      } )
    );
    expect( userOnFinish ).toHaveBeenCalledWith( finishEvent );
  } );

  it( 'streamText: onError callback traces error and calls user callback', async () => {
    const { streamText } = await importSut();
    const userOnError = vi.fn();

    streamText( { prompt: 'test_prompt@v1', onError: userOnError } );

    const callArgs = aiFns.streamText.mock.calls[0][0];
    const error = new Error( 'Stream failed' );
    callArgs.onError( { error } );

    expect( tracingSpies.addEventError ).toHaveBeenCalledWith(
      expect.objectContaining( { details: error } )
    );
    expect( userOnError ).toHaveBeenCalledWith( { error } );
  } );

  it( 'streamText: works without user onFinish/onError callbacks', async () => {
    const { streamText } = await importSut();

    streamText( { prompt: 'test_prompt@v1' } );

    const callArgs = aiFns.streamText.mock.calls[0][0];
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const finishEvent = {
      text: 'TEXT',
      usage,
      totalUsage: usage,
      finishReason: 'stop'
    };
    await expect( callArgs.onFinish( finishEvent ) ).resolves.toBeUndefined();
    expect( emitEventSpy ).toHaveBeenCalledWith( 'llm:call_cost', {
      modelId: basePrompt.config.model,
      cost,
      usage
    } );
    expect( () => callArgs.onError( { error: new Error( 'fail' ) } ) ).not.toThrow();
  } );

  it( 'streamText: passes through AI SDK streaming options', async () => {
    const { streamText } = await importSut();
    const mockOnChunk = vi.fn();
    const mockOnStepFinish = vi.fn();
    const mockTransform = vi.fn();
    const mockTools = { calculator: { description: 'A calculator tool' } };

    streamText( {
      prompt: 'test_prompt@v1',
      tools: mockTools,
      toolChoice: 'required',
      maxRetries: 5,
      onChunk: mockOnChunk,
      onStepFinish: mockOnStepFinish,
      experimental_transform: mockTransform
    } );

    expect( aiFns.streamText ).toHaveBeenCalledWith(
      expect.objectContaining( {
        tools: mockTools,
        toolChoice: 'required',
        maxRetries: 5,
        onChunk: mockOnChunk,
        onStepFinish: mockOnStepFinish,
        experimental_transform: mockTransform
      } )
    );
  } );

  it( 'streamText: user onFinish/onError are not passed raw to AI SDK', async () => {
    const { streamText } = await importSut();
    const userOnFinish = vi.fn();
    const userOnError = vi.fn();

    streamText( { prompt: 'test_prompt@v1', onFinish: userOnFinish, onError: userOnError } );

    const callArgs = aiFns.streamText.mock.calls[0][0];
    expect( callArgs.onFinish ).not.toBe( userOnFinish );
    expect( callArgs.onError ).not.toBe( userOnError );
  } );

  it( 'streamText: validation failure propagates synchronously', async () => {
    const validationError = new Error( 'prompt is required' );
    validators.validateStreamTextArgs.mockImplementationOnce( () => {
      throw validationError;
    } );
    const { streamText } = await importSut();

    expect( () => streamText( { prompt: '' } ) ).toThrow( validationError );
    expect( aiFns.streamText ).not.toHaveBeenCalled();
  } );

  it( 'streamText: trace start event includes correct name and details', async () => {
    const { streamText } = await importSut();
    const vars = { topic: 'testing' };

    streamText( { prompt: 'test_prompt@v1', variables: vars } );

    expect( tracingSpies.addEventStart ).toHaveBeenCalledWith( {
      kind: 'llm',
      name: 'streamText',
      id: expect.stringContaining( 'streamText-' ),
      details: {
        prompt: 'test_prompt@v1',
        variables: vars,
        loadedPrompt: basePrompt
      }
    } );
  } );

  it( 'streamText: traces error and rethrows when AI.streamText throws synchronously', async () => {
    const syncError = new Error( 'Invalid model config' );
    aiFns.streamText.mockImplementation( () => {
      throw syncError;
    } );
    const { streamText } = await importSut();

    expect( () => streamText( { prompt: 'test_prompt@v1' } ) ).toThrow( syncError );
    expect( tracingSpies.addEventError ).toHaveBeenCalledWith(
      expect.objectContaining( { details: syncError } )
    );
  } );

  it( 'streamText: passes variables to prompt loader', async () => {
    const { streamText } = await importSut();
    const vars = { name: 'World', count: 5 };

    streamText( { prompt: 'test_prompt@v1', variables: vars } );

    expect( loadPromptImpl ).toHaveBeenCalledWith( 'test_prompt@v1', vars );
  } );

  it( 'generateText: merges tool-extracted sources into response.sources', async () => {
    const extracted = [
      { type: 'source', sourceType: 'url', id: 'abc123', url: 'https://tool.com/1', title: 'Tool 1' },
      { type: 'source', sourceType: 'url', id: 'def456', url: 'https://tool.com/2', title: 'Tool 2' }
    ];
    extractSourcesFromStepsImpl.mockReturnValue( extracted );

    const usageTools = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    aiFns.generateText.mockResolvedValueOnce( {
      text: 'answer',
      sources: [],
      steps: [ { toolResults: [] } ],
      usage: usageTools,
      totalUsage: usageTools,
      finishReason: 'stop'
    } );

    const { generateText } = await importSut();
    const result = await generateText( { prompt: 'test_prompt@v1' } );

    expect( result.sources ).toEqual( extracted );
  } );

  it( 'generateText: deduplicates extracted sources against native sources', async () => {
    const nativeSources = [
      { type: 'source', sourceType: 'url', id: 'native1', url: 'https://shared.com', title: 'Native' }
    ];
    const extracted = [
      { type: 'source', sourceType: 'url', id: 'ext1', url: 'https://shared.com', title: 'Extracted' },
      { type: 'source', sourceType: 'url', id: 'ext2', url: 'https://unique.com', title: 'Unique' }
    ];
    extractSourcesFromStepsImpl.mockReturnValue( extracted );

    const usageDedup = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    aiFns.generateText.mockResolvedValueOnce( {
      text: 'answer',
      sources: nativeSources,
      steps: [ { toolResults: [] } ],
      usage: usageDedup,
      totalUsage: usageDedup,
      finishReason: 'stop'
    } );

    const { generateText } = await importSut();
    const result = await generateText( { prompt: 'test_prompt@v1' } );

    expect( result.sources ).toHaveLength( 2 );
    expect( result.sources[0].url ).toBe( 'https://shared.com' );
    expect( result.sources[0].title ).toBe( 'Native' );
    expect( result.sources[1].url ).toBe( 'https://unique.com' );
  } );

  it( 'generateText: returns native sources unchanged when no tool sources extracted', async () => {
    const nativeSources = [
      { type: 'source', sourceType: 'url', id: 'n1', url: 'https://native.com', title: 'Native' }
    ];
    extractSourcesFromStepsImpl.mockReturnValue( [] );

    const usageNative = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    aiFns.generateText.mockResolvedValueOnce( {
      text: 'answer',
      sources: nativeSources,
      usage: usageNative,
      totalUsage: usageNative,
      finishReason: 'stop'
    } );

    const { generateText } = await importSut();
    const result = await generateText( { prompt: 'test_prompt@v1' } );

    expect( result.sources ).toEqual( nativeSources );
  } );

  it( 'generateText: includes costs from cost module in trace details', async () => {
    const customCost = { total: 0.02, components: { input: { value: 0.01 }, output: { value: 0.01 } } };
    calculateLLMCallCostImpl.mockResolvedValueOnce( customCost );

    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1' } );

    expect( calculateLLMCallCostImpl ).toHaveBeenCalledWith( {
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      modelId: basePrompt.config.model
    } );
    expect( tracingSpies.addEventEnd ).toHaveBeenCalledWith(
      expect.objectContaining( { details: expect.objectContaining( { cost: customCost } ) } )
    );
  } );

  it( 'generateText: loads frontmatter skills from prompt config using promptFileDir', async () => {
    const frontmatterSkill = { name: 'fm_skill', description: 'FM', instructions: '# FM' };
    loadPromptImpl.mockReturnValue( {
      ...basePrompt,
      promptFileDir: '/some/prompt/dir',
      config: { ...basePrompt.config, skills: [ './skills/' ] }
    } );
    loadPromptSkillsImpl.mockReturnValue( [ frontmatterSkill ] );
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1' } );

    expect( loadPromptSkillsImpl ).toHaveBeenCalledWith( [ './skills/' ], '/some/prompt/dir' );
    const callArgs = aiFns.generateText.mock.calls[0][0];
    expect( callArgs.tools ).toHaveProperty( 'load_skill' );
  } );

  it( 'generateText: merges frontmatter skills with caller-provided skills', async () => {
    const frontmatterSkill = { name: 'fm_skill', description: 'FM', instructions: '# FM' };
    const callerSkill = { name: 'caller_skill', description: 'Caller', instructions: '# Caller' };
    loadPromptImpl.mockReturnValue( {
      ...basePrompt,
      promptFileDir: '/some/prompt/dir',
      config: { ...basePrompt.config, skills: [ './skills/' ] }
    } );
    loadPromptSkillsImpl.mockReturnValue( [ frontmatterSkill ] );
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills: [ callerSkill ] } );

    expect( loadPromptImpl ).toHaveBeenCalledWith(
      'test_prompt@v1',
      expect.objectContaining( { _system_skills: expect.stringContaining( 'fm_skill' ) } )
    );
    const callArgs = aiFns.generateText.mock.calls[0][0];
    const loadSkillResult = callArgs.tools.load_skill.execute( { name: 'caller_skill' } );
    expect( loadSkillResult ).toBe( '# Caller' );
  } );

  it( 'generateText: skips frontmatter skill loading when no config.skills', async () => {
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1' } );

    expect( loadPromptSkillsImpl ).not.toHaveBeenCalled();
  } );

  it( 'generateText: skips frontmatter skill loading when no promptFileDir', async () => {
    loadPromptImpl.mockReturnValue( {
      ...basePrompt,
      config: { ...basePrompt.config, skills: [ './skills/' ] }
      // no promptFileDir
    } );
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1' } );

    expect( loadPromptSkillsImpl ).not.toHaveBeenCalled();
    const callArgs = aiFns.generateText.mock.calls[0][0];
    expect( callArgs.tools ).toBeUndefined();
  } );

  it( 'generateText: re-renders prompt with _system_skills after loading all skills', async () => {
    const frontmatterSkill = { name: 'fm_skill', description: 'FM skill', instructions: '# FM' };
    loadPromptImpl.mockReturnValue( {
      ...basePrompt,
      promptFileDir: '/dir',
      config: { ...basePrompt.config, skills: [ './skills/' ] }
    } );
    loadPromptSkillsImpl.mockReturnValue( [ frontmatterSkill ] );
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', variables: { topic: 'AI' } } );

    // Second loadPrompt call renders with _system_skills injected
    const calls = loadPromptImpl.mock.calls;
    expect( calls ).toHaveLength( 2 );
    expect( calls[1][1] ).toMatchObject( { topic: 'AI', _system_skills: expect.stringContaining( 'fm_skill' ) } );
  } );

  it( 'generateText: injects _system_skills and load_skill tool when skills provided', async () => {
    const skills = [
      { name: 'research', description: 'Research approach', instructions: '# Research\nDo research' }
    ];
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills } );

    expect( loadPromptImpl ).toHaveBeenCalledWith(
      'test_prompt@v1',
      expect.objectContaining( { _system_skills: expect.stringContaining( 'research' ) } )
    );
    const callArgs = aiFns.generateText.mock.calls[0][0];
    expect( callArgs.tools ).toHaveProperty( 'load_skill' );
  } );

  it( 'generateText: does not inject _system_skills or load_skill when skills is empty', async () => {
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills: [] } );

    expect( loadPromptImpl ).toHaveBeenCalledWith( 'test_prompt@v1', undefined );
    const callArgs = aiFns.generateText.mock.calls[0][0];
    expect( callArgs.tools ).toBeUndefined();
    expect( callArgs.stopWhen ).toBeUndefined();
  } );

  it( 'generateText: load_skill execute returns instructions for known skill', async () => {
    const skills = [
      { name: 'research', description: 'Research', instructions: '# Research\nDetailed steps' }
    ];
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills } );

    const { tools } = aiFns.generateText.mock.calls[0][0];
    const result = tools.load_skill.execute( { name: 'research' } );
    expect( result ).toBe( '# Research\nDetailed steps' );
  } );

  it( 'generateText: load_skill execute returns error for unknown skill', async () => {
    const skills = [
      { name: 'research', description: 'Research', instructions: '# Research' }
    ];
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills } );

    const { tools } = aiFns.generateText.mock.calls[0][0];
    const result = tools.load_skill.execute( { name: 'unknown' } );
    expect( result ).toMatch( /not found/ );
    expect( result ).toContain( 'research' );
  } );

  it( 'generateText: sets stopWhen via maxSteps when skills present', async () => {
    const skills = [ { name: 'skill', description: 'A skill', instructions: '# Skill' } ];
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills, maxSteps: 5 } );

    expect( aiFns.generateText ).toHaveBeenCalledWith(
      expect.objectContaining( { stopWhen: { type: 'stepCount', count: 5 } } )
    );
  } );

  it( 'generateText: defaults maxSteps to 10 when skills present', async () => {
    const skills = [ { name: 'skill', description: 'A skill', instructions: '# Skill' } ];
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills } );

    expect( aiFns.generateText ).toHaveBeenCalledWith(
      expect.objectContaining( { stopWhen: { type: 'stepCount', count: 10 } } )
    );
  } );

  it( 'generateText: merges skill tools with user-provided tools', async () => {
    const skills = [ { name: 'skill', description: 'A skill', instructions: '# Skill' } ];
    const userTools = { calculator: { description: 'A calculator' } };
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills, tools: userTools } );

    const { tools } = aiFns.generateText.mock.calls[0][0];
    expect( tools ).toHaveProperty( 'load_skill' );
    expect( tools ).toHaveProperty( 'calculator' );
  } );

  it( 'generateText: calls skill function with variables and uses resolved skills', async () => {
    const resolvedSkill = { name: 'dynamic', description: 'Dynamic skill', instructions: '# Dynamic' };
    const skillsFn = vi.fn().mockResolvedValue( [ resolvedSkill ] );
    const vars = { topic: 'AI' };
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', variables: vars, skills: skillsFn } );

    expect( skillsFn ).toHaveBeenCalledWith( vars );
    expect( loadPromptImpl ).toHaveBeenCalledWith(
      'test_prompt@v1',
      expect.objectContaining( { _system_skills: expect.stringContaining( 'dynamic' ) } )
    );
    const callArgs = aiFns.generateText.mock.calls[0][0];
    expect( callArgs.tools ).toHaveProperty( 'load_skill' );
  } );

  it( 'generateText: preserves caller stopWhen when skills present', async () => {
    const skills = [ { name: 'skill', description: 'A skill', instructions: '# Skill' } ];
    const customStop = { type: 'custom' };
    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1', skills, stopWhen: customStop } );

    expect( aiFns.generateText ).toHaveBeenCalledWith(
      expect.objectContaining( { stopWhen: customStop } )
    );
  } );

  it( 'generateText: includes sourcesFromTools in trace details', async () => {
    const extracted = [
      { type: 'source', sourceType: 'url', id: 'abc', url: 'https://t.com', title: 'T' }
    ];
    extractSourcesFromStepsImpl.mockReturnValue( extracted );

    const usageSources = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    aiFns.generateText.mockResolvedValueOnce( {
      text: 'TEXT',
      sources: [],
      steps: [],
      usage: usageSources,
      totalUsage: usageSources,
      finishReason: 'stop'
    } );

    const { generateText } = await importSut();
    await generateText( { prompt: 'test_prompt@v1' } );

    expect( tracingSpies.addEventEnd ).toHaveBeenCalledWith(
      expect.objectContaining( {
        details: expect.objectContaining( { sourcesFromTools: extracted } )
      } )
    );
  } );
} );
