import { describe, it, expect } from 'vitest';
import { ValidationError } from '@outputai/core';
import { parsePromptSchema } from './validations.js';

const parse = prompt => parsePromptSchema( { fileDir: '/prompts', ...prompt } );

describe( 'parsePromptSchema', () => {
  it( 'should validate a correct prompt with all required fields', () => {
    const validPrompt = {
      name: 'test-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        temperature: 0.7,
        maxOutputTokens: 1000,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.2,
        frequencyPenalty: 0.3,
        stopSequences: [ 'END' ],
        seed: 42
      },
      messages: [
        {
          role: 'user',
          content: 'Hello, world!'
        }
      ]
    };

    expect( () => parse( validPrompt ) ).not.toThrow();
  } );

  it.each( [ 'temperature', 'topK', 'topP' ] )( 'should reject a negative %s', field => {
    expect( () => parse( {
      name: `negative-${field}`,
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        [field]: -0.1
      },
      messages: [ { role: 'user', content: 'Hello' } ]
    } ) ).toThrow( ValidationError );
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

    expect( parse( minimalPrompt ).config.skills ).toEqual( [] );
    expect( parse( minimalPrompt ).config.maxSteps ).toBe( 10 );
    expect( parse( minimalPrompt ).variables ).toEqual( {} );
  } );

  it( 'should copy deprecated maxTokens to maxOutputTokens', () => {
    const result = parse( {
      name: 'deprecated-max-tokens',
      config: {
        provider: 'openai',
        model: 'gpt-4',
        maxTokens: 1000
      },
      messages: [ { role: 'user', content: 'Hello' } ]
    } );

    expect( result.config.maxTokens ).toBe( 1000 );
    expect( result.config.maxOutputTokens ).toBe( 1000 );
  } );

  it( 'should keep maxOutputTokens when both token limit keys are set', () => {
    const result = parse( {
      name: 'both-token-limits',
      config: {
        provider: 'openai',
        model: 'gpt-4',
        maxTokens: 1000,
        maxOutputTokens: 2000
      },
      messages: [ { role: 'user', content: 'Hello' } ]
    } );

    expect( result.config.maxTokens ).toBe( 1000 );
    expect( result.config.maxOutputTokens ).toBe( 2000 );
  } );

  it( 'should reject an unsupported message role', () => {
    expect( () => parse( {
      name: 'invalid-role',
      config: {
        provider: 'openai',
        model: 'gpt-4'
      },
      messages: [ {
        role: 'developer',
        content: 'You are a helpful assistant.'
      } ]
    } ) ).toThrow( /messages\[0\]\.role/ );
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

    expect( () => parse( promptWithThinking ) ).not.toThrow();
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

    expect( () => parse( promptWithThinkingDisabled ) ).not.toThrow();
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

    expect( () => parse( promptWithThinkingNoBudget ) ).not.toThrow();
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

    expect( () => parse( promptWithAnthropicOptions ) ).not.toThrow();
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

    expect( () => parse( promptWithOpenAIOptions ) ).not.toThrow();
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

    expect( () => parse( promptWithAzureOptions ) ).not.toThrow();
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

    expect( () => parse( promptWithMixedOptions ) ).not.toThrow();
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

    expect( () => parse( customProviderPrompt ) ).not.toThrow();
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

    expect( () => parse( imagePrompt ) ).not.toThrow();
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

    expect( () => parse( instructionsPrompt ) ).not.toThrow();
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

    expect( () => parse( messagesPrompt ) ).not.toThrow();
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

    expect( () => parse( whitespaceInstructionsPrompt ) ).toThrow( ValidationError );
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

    expect( () => parse( mixedPrompt ) ).toThrow( ValidationError );
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

    expect( () => parse( emptyPrompt ) ).toThrow( ValidationError );
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

    expect( parse( promptWithSkills ).config.skills ).toEqual( [ './skills', './review.md' ] );
  } );

  it( 'coerces a single skill path to an array', () => {
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

    expect( parse( promptWithSkill ).config.skills ).toEqual( [ './skills' ] );
  } );

  it( 'coerces null skills to an empty array', () => {
    const promptWithNullSkills = {
      name: 'null-skills-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        skills: null
      },
      messages: [
        {
          role: 'user',
          content: 'Review this.'
        }
      ]
    };

    expect( parse( promptWithNullSkills ).config.skills ).toEqual( [] );
  } );

  it( 'should validate prompt maxSteps', () => {
    const promptWithMaxSteps = {
      name: 'max-steps-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        maxSteps: 4
      },
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    };

    expect( parse( promptWithMaxSteps ).config.maxSteps ).toBe( 4 );
  } );

  it( 'should throw ValidationError for invalid maxSteps', () => {
    for ( const maxSteps of [ 0, -1, 1.5 ] ) {
      expect( () => parse( {
        name: 'invalid-max-steps',
        config: {
          provider: 'anthropic',
          model: 'claude-3-opus-20240229',
          maxSteps
        },
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ]
      } ) ).toThrow( ValidationError );
    }
  } );

  it( 'throws ValidationError when fileDir is missing', () => {
    expect( () => parsePromptSchema( {
      name: 'no-file-dir',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229'
      },
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    } ) ).toThrow( ValidationError );
  } );

  it( 'accepts scalar, object, and array variables', () => {
    expect( parse( {
      name: 'typed-variables',
      config: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229'
      },
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ],
      variables: {
        name: 'Acme',
        size: 250,
        active: true,
        company: { name: 'Acme' },
        industries: [ 'SaaS', 'AI' ]
      }
    } ).variables ).toEqual( {
      name: 'Acme',
      size: 250,
      active: true,
      company: { name: 'Acme' },
      industries: [ 'SaaS', 'AI' ]
    } );
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

    expect( () => parse( promptWithTools ) ).not.toThrow();
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

    expect( () => parse( invalidToolsPrompt ) ).toThrow( ValidationError );
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

    expect( () => parse( invalidToolConfigPrompt ) ).toThrow( ValidationError );
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

    expect( () => parse( invalidSkillsPrompt ) ).toThrow( ValidationError );
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

    expect( () => parse( invalidImagePrompt ) ).toThrow( ValidationError );
  } );

  it( 'should reject unrecognized config fields', () => {
    const extraFieldsPrompt = {
      name: 'extra-fields-prompt',
      config: {
        provider: 'openai',
        model: 'gpt-4',
        unsupportedOption: true
      },
      messages: [
        {
          role: 'user',
          content: 'Test'
        }
      ]
    };

    expect( () => parse( extraFieldsPrompt ) ).toThrow( /unrecognized key/i );
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

    expect( () => parse( emptyProviderPrompt ) ).toThrow( ValidationError );
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

    expect( () => parse( missingNamePrompt ) ).toThrow( ValidationError );
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

    expect( () => parse( promptWithBudgetTokensSnake ) ).not.toThrow();
  } );

  it( 'should suggest camelCase when a snake_case config key matches a known field', () => {
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

    expect( () => parse( maxTokensSnakeCase ) ).toThrow( /"max_tokens" is not valid; use "maxTokens"/ );
  } );

  it( 'should validate per-message providerOptions', () => {
    const promptWithMessageProviderOptions = {
      name: 'message-options-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        messageOptions: {
          cached: { anthropic: { cacheControl: { type: 'ephemeral' } } }
        }
      },
      messages: [
        {
          role: 'system',
          content: 'Docs.',
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
        },
        { role: 'user', content: 'Question' }
      ]
    };

    expect( () => parse( promptWithMessageProviderOptions ) ).not.toThrow();
  } );

  it( 'should reject leftover attributes on a message', () => {
    const leftoverAttributesPrompt = {
      name: 'leftover-attributes-prompt',
      config: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5'
      },
      messages: [
        { role: 'system', content: 'Static.', attributes: { options: 'cached' } }
      ]
    };

    expect( () => parse( leftoverAttributesPrompt ) ).toThrow( ValidationError );
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

    expect( () => parse( unknownFieldPrompt ) ).toThrow( ValidationError );
  } );
} );
