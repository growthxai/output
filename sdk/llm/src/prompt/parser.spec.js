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

    const result = parsePrompt( raw );

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
  } );

  it( 'throws error when content is empty', () => {
    const raw = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
---

`;

    expect( () => {
      parsePrompt( raw );
    } ).toThrow( /no content after frontmatter/ );
  } );

  it( 'throws error when no valid message blocks found', () => {
    const raw = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
---

This is just plain text without any message tags.`;

    expect( () => {
      parsePrompt( raw );
    } ).toThrow( /No valid message blocks found/ );
    expect( () => {
      parsePrompt( raw );
    } ).toThrow( /Expected format/ );
  } );

  it( 'should use providerOptions with budgetTokens in camelCase', () => {
    // Frontmatter uses canonical format: providerOptions.thinking.budgetTokens
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

    const result = parsePrompt( raw );

    expect( result.config.provider ).toBe( 'anthropic' );
    expect( result.config.model ).toBe( 'claude-sonnet-4-20250514' );
    expect( result.config.temperature ).toBe( 0.7 );
    expect( result.config.maxTokens ).toBe( 64000 );

    // Now expects canonical schema format in front-matter
    expect( result.config.providerOptions ).toBeDefined();
    expect( result.config.providerOptions.thinking ).toBeDefined();
    expect( result.config.providerOptions.thinking.type ).toBe( 'enabled' );
    expect( result.config.providerOptions.thinking.budgetTokens ).toBe( 1500 );
  } );

  it( 'should parse snake_case fields as-is (validation catches them later)', () => {
    // Parser extracts fields as-is from frontmatter; validation happens later
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

    const result = parsePrompt( raw );

    // Parser extracts snake_case fields as-is
    expect( result.config.provider ).toBe( 'anthropic' );
    expect( result.config.model ).toBe( 'claude-sonnet-4-20250514' );
    expect( result.config.temperature ).toBe( 0.7 );
    // snake_case preserved here because we're only calling parsePrompt, not validatePrompt
    expect( result.config.max_tokens ).toBe( 64000 );
    // camelCase not set because we only call parsePrompt
    expect( result.config.maxTokens ).toBeUndefined();

    // Snake_case fields in nested objects also preserved
    expect( result.config.providerOptions ).toBeDefined();
    expect( result.config.providerOptions.thinking ).toBeDefined();
    expect( result.config.providerOptions.thinking.type ).toBe( 'enabled' );
    expect( result.config.providerOptions.thinking.budget_tokens ).toBe( 1500 ); // snake_case preserved
    expect( result.config.providerOptions.thinking.budgetTokens ).toBeUndefined(); // camelCase not set
  } );
} );
