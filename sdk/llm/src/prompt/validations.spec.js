import { describe, it, expect } from 'vitest';
import { ValidationError } from '@outputai/core';
import { validatePrompt } from './validations.js';

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

  it( 'should validate image generation config fields', () => {
    const imagePrompt = {
      name: 'image-prompt',
      config: {
        provider: 'openai',
        model: 'gpt-image-1',
        n: 2,
        maxImagesPerCall: 1,
        size: '1024x1024',
        aspectRatio: '1:1',
        seed: 42,
        providerOptions: {
          openai: {
            quality: 'high'
          }
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Generate an image of a mountain.'
        }
      ]
    };

    expect( () => validatePrompt( imagePrompt ) ).not.toThrow();
  } );

  it( 'should validate a plain-instructions prompt without messages', () => {
    const instructionsPrompt = {
      name: 'image-prompt',
      config: {
        provider: 'openai',
        model: 'gpt-image-1'
      },
      messages: [],
      instructions: 'Generate an image of a mountain.'
    };

    expect( () => validatePrompt( instructionsPrompt ) ).not.toThrow();
  } );

  it( 'should validate role messages with null instructions', () => {
    const messagesPrompt = {
      name: 'messages-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229'
      },
      messages: [
        {
          role: 'user',
          content: 'Write a summary.'
        }
      ],
      instructions: null
    };

    expect( () => validatePrompt( messagesPrompt ) ).not.toThrow();
  } );

  it( 'should throw ValidationError when instructions are only whitespace', () => {
    const whitespaceInstructionsPrompt = {
      name: 'empty-instructions-prompt',
      config: {
        provider: 'openai',
        model: 'gpt-image-1'
      },
      messages: [],
      instructions: '   '
    };

    expect( () => validatePrompt( whitespaceInstructionsPrompt ) ).toThrow( ValidationError );
  } );

  it( 'should throw ValidationError when both messages and instructions are present', () => {
    const mixedPrompt = {
      name: 'mixed-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229'
      },
      messages: [
        {
          role: 'user',
          content: 'Write a summary.'
        }
      ],
      instructions: 'Plain instructions should not be mixed with messages.'
    };

    expect( () => validatePrompt( mixedPrompt ) ).toThrow( ValidationError );
  } );

  it( 'should throw ValidationError when neither messages nor instructions are present', () => {
    const emptyPrompt = {
      name: 'empty-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229'
      },
      messages: [],
      instructions: null
    };

    expect( () => validatePrompt( emptyPrompt ) ).toThrow( ValidationError );
  } );

  it( 'should validate a prompt with skill path config', () => {
    const promptWithSkills = {
      name: 'skills-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        skills: [ './skills', './review.md' ]
      },
      messages: [
        {
          role: 'user',
          content: 'Review this.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithSkills ) ).not.toThrow();
  } );

  it( 'should validate a prompt with a single skill path config', () => {
    const promptWithSkill = {
      name: 'skill-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        skills: './skills'
      },
      messages: [
        {
          role: 'user',
          content: 'Review this.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithSkill ) ).not.toThrow();
  } );

  it( 'should validate provider tool config records', () => {
    const promptWithTools = {
      name: 'tools-prompt',
      config: {
        provider: 'vertex',
        model: 'gemini-2.0-flash',
        tools: {
          googleSearch: {
            mode: 'MODE_DYNAMIC',
            dynamicThreshold: 0.8
          },
          urlContext: {}
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Research this.'
        }
      ]
    };

    expect( () => validatePrompt( promptWithTools ) ).not.toThrow();
  } );

  it( 'should throw ValidationError when tools config is not a record', () => {
    const invalidToolsPrompt = {
      name: 'invalid-tools-prompt',
      config: {
        provider: 'vertex',
        model: 'gemini-2.0-flash',
        tools: [ 'googleSearch' ]
      },
      messages: [
        {
          role: 'user',
          content: 'Research this.'
        }
      ]
    };

    expect( () => validatePrompt( invalidToolsPrompt ) ).toThrow( ValidationError );
  } );

  it( 'should throw ValidationError when a tool config is not a record', () => {
    const invalidToolConfigPrompt = {
      name: 'invalid-tool-config-prompt',
      config: {
        provider: 'vertex',
        model: 'gemini-2.0-flash',
        tools: {
          googleSearch: 'MODE_DYNAMIC'
        }
      },
      messages: [
        {
          role: 'user',
          content: 'Research this.'
        }
      ]
    };

    expect( () => validatePrompt( invalidToolConfigPrompt ) ).toThrow( ValidationError );
  } );

  it( 'should throw ValidationError for invalid skill path config', () => {
    const invalidSkillsPrompt = {
      name: 'invalid-skills-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        skills: [ './skills', '' ]
      },
      messages: [
        {
          role: 'user',
          content: 'Review this.'
        }
      ]
    };

    expect( () => validatePrompt( invalidSkillsPrompt ) ).toThrow( ValidationError );
  } );

  it( 'should throw ValidationError for invalid image generation config fields', () => {
    const invalidImagePrompt = {
      name: 'invalid-image-prompt',
      config: {
        provider: 'openai',
        model: 'gpt-image-1',
        n: 0,
        maxImagesPerCall: 1.5,
        size: 'square',
        aspectRatio: '16x9',
        seed: 1.2
      },
      messages: [
        {
          role: 'user',
          content: 'Generate an image of a mountain.'
        }
      ]
    };

    expect( () => validatePrompt( invalidImagePrompt ) ).toThrow( ValidationError );
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

  it( 'should validate the options attribute referencing messageOptions sets', () => {
    const promptWithMessageOptions = {
      name: 'message-options-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        messageOptions: {
          cached: { anthropic: { cacheControl: { type: 'ephemeral' } } }
        }
      },
      messages: [
        { role: 'system', content: 'Docs.', attributes: { options: 'cached' } },
        { role: 'user', content: 'Question' }
      ]
    };

    expect( () => validatePrompt( promptWithMessageOptions ) ).not.toThrow();
  } );

  it( 'should reject the removed cache shorthand as an unknown block attribute', () => {
    const cacheShorthandPrompt = {
      name: 'cache-shorthand-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5'
      },
      messages: [
        { role: 'system', content: 'Static.', attributes: { cache: true } }
      ]
    };

    expect( () => validatePrompt( cacheShorthandPrompt ) ).toThrow( ValidationError );
  } );

  it( 'should throw ValidationError for unknown top-level message fields', () => {
    const unknownFieldPrompt = {
      name: 'unknown-field-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5'
      },
      messages: [
        { role: 'user', content: 'Hi', options: 'cached' }
      ]
    };

    expect( () => validatePrompt( unknownFieldPrompt ) ).toThrow( ValidationError );
  } );
} );
