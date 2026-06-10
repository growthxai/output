import { describe, it, expect } from 'vitest';
import { parsePrompt } from './parser.js';

describe( 'parsePrompt', () => {
  it( 'parses frontmatter config and message blocks', () => {
    const raw = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
---

<system>You are a helpful assistant.</system>
<user>Hello!</user>`;

    const result = parsePrompt( { name: 'test', raw } );

    expect( result.config ).toEqual( {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022'
    } );
    expect( result.messages ).toHaveLength( 2 );
    expect( result.messages[0] ).toEqual( {
      role: 'system',
      content: 'You are a helpful assistant.'
    } );
    expect( result.messages[1] ).toEqual( {
      role: 'user',
      content: 'Hello!'
    } );
    expect( result.instructions ).toBeNull();
  } );

  it( 'parses raw instructions when no message blocks are present', () => {
    const raw = `---
provider: openai
model: gpt-image-1
---

Generate a cinematic image of a NASCAR race at sunset.`;

    const result = parsePrompt( { name: 'image_prompt', raw } );

    expect( result ).toEqual( {
      config: {
        provider: 'openai',
        model: 'gpt-image-1'
      },
      messages: [],
      instructions: 'Generate a cinematic image of a NASCAR race at sunset.'
    } );
  } );

  it( 'trims raw instructions', () => {
    const raw = `---
provider: openai
model: gpt-image-1
---

  Generate a poster.

`;

    const result = parsePrompt( { name: 'image_prompt', raw } );

    expect( result.instructions ).toBe( 'Generate a poster.' );
  } );

  it( 'throws error when content is empty', () => {
    const raw = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
---

`;

    expect( () => {
      parsePrompt( { name: 'empty_prompt', raw } );
    } ).toThrow( /Prompt "empty_prompt" has no content after frontmatter/ );
  } );

  it( 'parses providerOptions with budgetTokens in camelCase', () => {
    const raw = `---
provider: anthropic
model: claude-sonnet-4-20250514
temperature: 0.7
maxTokens: 64000
providerOptions:
  thinking:
    type: enabled
    budgetTokens: 1500
---

<user>Test</user>`;

    const result = parsePrompt( { name: 'test', raw } );

    expect( result.config.provider ).toBe( 'anthropic' );
    expect( result.config.model ).toBe( 'claude-sonnet-4-20250514' );
    expect( result.config.temperature ).toBe( 0.7 );
    expect( result.config.maxTokens ).toBe( 64000 );
    expect( result.config.providerOptions ).toBeDefined();
    expect( result.config.providerOptions.thinking ).toBeDefined();
    expect( result.config.providerOptions.thinking.type ).toBe( 'enabled' );
    expect( result.config.providerOptions.thinking.budgetTokens ).toBe( 1500 );
  } );

  it( 'parses snake_case fields as-is so validation can catch them later', () => {
    const raw = `---
provider: anthropic
model: claude-sonnet-4-20250514
temperature: 0.7
max_tokens: 64000
providerOptions:
  thinking:
    type: enabled
    budget_tokens: 1500
---

<user>Test</user>`;

    const result = parsePrompt( { name: 'test', raw } );

    expect( result.config.provider ).toBe( 'anthropic' );
    expect( result.config.model ).toBe( 'claude-sonnet-4-20250514' );
    expect( result.config.temperature ).toBe( 0.7 );
    expect( result.config.max_tokens ).toBe( 64000 );
    expect( result.config.maxTokens ).toBeUndefined();
    expect( result.config.providerOptions ).toBeDefined();
    expect( result.config.providerOptions.thinking ).toBeDefined();
    expect( result.config.providerOptions.thinking.type ).toBe( 'enabled' );
    expect( result.config.providerOptions.thinking.budget_tokens ).toBe( 1500 );
    expect( result.config.providerOptions.thinking.budgetTokens ).toBeUndefined();
  } );

  it( 'parses supported message roles', () => {
    const raw = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
---

<system>System message</system>
<assistant>Assistant message</assistant>
<tool>Tool message</tool>
<user>User message</user>`;

    const result = parsePrompt( { name: 'test', raw } );

    expect( result.messages ).toEqual( [
      {
        role: 'system',
        content: 'System message'
      },
      {
        role: 'assistant',
        content: 'Assistant message'
      },
      {
        role: 'tool',
        content: 'Tool message'
      },
      {
        role: 'user',
        content: 'User message'
      }
    ] );
    expect( result.instructions ).toBeNull();
  } );

  it( 'surfaces block opening-tag attributes as an attributes object', () => {
    const raw = `---
provider: anthropic
model: claude-sonnet-4-5
---

<system options="cached">Static.</system>
<user>Question</user>`;

    const result = parsePrompt( { name: 'test', raw } );

    expect( result.messages[0] ).toEqual( {
      role: 'system',
      content: 'Static.',
      attributes: { options: 'cached' }
    } );
    expect( result.messages[1] ).toEqual( { role: 'user', content: 'Question' } );
  } );
} );
