import { describe, it, expect, vi } from 'vitest';
import { ValidationError } from '@outputai/core';
import { validatePrompt } from './prompt_validations.js';

describe( 'validatePrompt', () => {
  it( 'should validate a correct prompt with all required fields', () => {
    const validPrompt = {
      name: 'test-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        temperature: 0.7,
        maxTokens: 1000
      },
      messages: [
        {
          role: 'user',
          content: 'Hello, world!'
        }
      ]
    };

    expect( () => validatePrompt( validPrompt ) ).not.toThrow();
  } );

  it( 'should validate a minimal prompt with only required fields', () => {
    const minimalPrompt = {
      name: 'minimal-prompt',
      config: {
        provider: 'openai',
        model: 'gpt-4'
      },
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant.'
        }
      ]
    };

    expect( () => validatePrompt( minimalPrompt ) ).not.toThrow();
  } );

  it( 'should validate a prompt with thinking providerOptions', () => {
    const promptWithThinking = {
      name: 'thinking-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        providerOptions: {
          thinking: {
            type: 'enabled',
            budgetTokens: 5000
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Solve this problem.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithThinking ) ).not.toThrow();
  } );

  it( 'should validate a prompt with thinking type disabled', () => {
    const promptWithThinkingDisabled = {
      name: 'thinking-disabled-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        providerOptions: {
          thinking: {
            type: 'disabled'
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Simple task.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithThinkingDisabled ) ).not.toThrow();
  } );

  it( 'should validate a prompt with thinking without budgetTokens', () => {
    const promptWithThinkingNoBudget = {
      name: 'thinking-no-budget',
      config: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        providerOptions: {
          thinking: {
            type: 'enabled'
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Think about this.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithThinkingNoBudget ) ).not.toThrow();
  } );

  it( 'should validate a prompt with anthropic-specific providerOptions', () => {
    const promptWithAnthropicOptions = {
      name: 'anthropic-options-prompt',
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
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Solve this problem.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithAnthropicOptions ) ).not.toThrow();
  } );

  it( 'should validate a prompt with openai-specific providerOptions', () => {
    const promptWithOpenAIOptions = {
      name: 'openai-options-prompt',
      config: {
        provider: 'openai',
        model: 'o3-mini',
        providerOptions: {
          openai: {
            reasoningEffort: 'high',
            reasoningSummary: 'detailed',
            customParameter: 'test'
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Analyze this data.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithOpenAIOptions ) ).not.toThrow();
  } );

  it( 'should validate a prompt with azure-specific providerOptions', () => {
    const promptWithAzureOptions = {
      name: 'azure-options-prompt',
      config: {
        provider: 'azure',
        model: 'gpt-4',
        providerOptions: {
          azure: {
            deploymentName: 'my-deployment',
            customConfig: { key: 'value' }
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Process this request.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithAzureOptions ) ).not.toThrow();
  } );

  it( 'should validate a prompt with mixed providerOptions including unknown fields', () => {
    const promptWithMixedOptions = {
      name: 'mixed-options-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        providerOptions: {
          thinking: {
            type: 'enabled',
            budgetTokens: 3000
          },
          anthropic: {
            effort: 'high'
          },
          customProviderField: 'should-be-allowed',
          anotherCustomField: {
            nested: 'value',
            array: [ 1, 2, 3 ]
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Complex request with multiple options.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithMixedOptions ) ).not.toThrow();
  } );

  it( 'should accept custom provider names for dynamic providers', () => {
    const customProviderPrompt = {
      name: 'custom-provider-prompt',
      config: {
        provider: 'my-custom-provider',
        model: 'custom-model-v1'
      },
      messages: [
        {
          role: 'user',
          content: 'Test'
        }
      ]
    };

    expect( () => validatePrompt( customProviderPrompt ) ).not.toThrow();
  } );

  it( 'should accept extra config fields via passthrough', () => {
    const extraFieldsPrompt = {
      name: 'extra-fields-prompt',
      config: {
        provider: 'openai',
        model: 'gpt-4',
        topP: 0.9,
        seed: 42,
        stopSequences: [ 'END' ]
      },
      messages: [
        {
          role: 'user',
          content: 'Test'
        }
      ]
    };

    expect( () => validatePrompt( extraFieldsPrompt ) ).not.toThrow();
  } );

  it( 'should throw ValidationError when provider is empty string', () => {
    const emptyProviderPrompt = {
      name: 'empty-provider',
      config: {
        provider: '',
        model: 'some-model'
      },
      messages: [
        {
          role: 'user',
          content: 'Test'
        }
      ]
    };

    expect( () => validatePrompt( emptyProviderPrompt ) ).toThrow( ValidationError );
  } );

  it( 'should throw ValidationError when required fields are missing', () => {
    const missingNamePrompt = {
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229'
      },
      messages: [
        {
          role: 'user',
          content: 'Test'
        }
      ]
    };

    expect( () => validatePrompt( missingNamePrompt ) ).toThrow( ValidationError );
  } );

  it( 'should pass through budget_tokens in thinking and warn about snake_case', () => {
    const warnSpy = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );

    const promptWithBudgetTokensSnake = {
      name: 'thinking-budget-snake',
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        providerOptions: {
          thinking: {
            type: 'enabled',
            budget_tokens: 10000
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Think hard.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithBudgetTokensSnake ) ).not.toThrow();
    expect( warnSpy ).toHaveBeenCalledWith(
      '[output-llm] "budget_tokens" found in providerOptions.thinking. Did you mean "budgetTokens"?'
    );

    warnSpy.mockRestore();
  } );

  it( 'should allow snake_case fields in config via passthrough (no longer strict)', () => {
    const maxTokensSnakeCase = {
      name: 'test-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        max_tokens: 4000
      },
      messages: [
        {
          role: 'user',
          content: 'Test'
        }
      ]
    };

    expect( () => validatePrompt( maxTokensSnakeCase ) ).not.toThrow();
  } );
} );
