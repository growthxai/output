import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPrompt } from './loader.js';

vi.mock( './load_content.js', () => ( {
  loadContent: vi.fn()
} ) );

import { loadContent } from './load_content.js';

describe( 'loadPrompt - validation with real schema', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'should accept valid camelCase format with providerOptions and budgetTokens', () => {
    const promptContent = `---
provider: anthropic
model: claude-sonnet-4-20250514
temperature: 0.7
maxTokens: 64000
providerOptions:
  thinking:
    type: enabled
    budgetTokens: 1500
---

<user>Hello</user>`;

    loadContent.mockReturnValue( { content: promptContent, dir: '/mock/dir' } );

    const result = loadPrompt( 'test', {} );

    expect( result.config.providerOptions ).toBeDefined();
    expect( result.config.providerOptions.thinking.type ).toBe( 'enabled' );
    expect( result.config.providerOptions.thinking.budgetTokens ).toBe( 1500 );
  } );

  it( 'should accept a plain-instructions prompt without message blocks', () => {
    const promptContent = `---
provider: openai
model: gpt-image-1
size: 1024x1024
---

Create a {{ style }} NASCAR image.

Scene:
{{ scene }}`;

    loadContent.mockReturnValue( { content: promptContent, dir: '/mock/dir' } );

    const result = loadPrompt( 'image_prompt', {
      scene: 'Three cars racing side-by-side through a banked turn',
      style: 'cinematic'
    } );

    expect( result.messages ).toEqual( [] );
    expect( result.instructions ).toBe(
      `Create a cinematic NASCAR image.

Scene:
Three cars racing side-by-side through a banked turn`
    );
    expect( result.config ).toEqual( {
      provider: 'openai',
      model: 'gpt-image-1',
      size: '1024x1024',
      skills: [],
      maxSteps: 10
    } );
  } );

  it( 'should reject snake_case max_tokens and suggest maxTokens', () => {
    const promptContent = `---
provider: anthropic
model: claude-sonnet-4-20250514
max_tokens: 64000
---

<user>Hello</user>`;

    loadContent.mockReturnValue( { content: promptContent, dir: '/mock/dir' } );

    expect( () => loadPrompt( 'test', {} ) ).toThrow( /"max_tokens" is not valid; use "maxTokens"/ );
  } );

  it( 'should reject an unknown "options" config field', () => {
    const promptContent = `---
provider: anthropic
model: claude-sonnet-4-20250514
options:
  thinking:
    type: enabled
    budgetTokens: 1500
---

<user>Hello</user>`;

    loadContent.mockReturnValue( { content: promptContent, dir: '/mock/dir' } );

    expect( () => loadPrompt( 'test', {} ) ).toThrow( /unrecognized key/i );
  } );

  it( 'should accept snake_case budget_tokens in thinking via passthrough', () => {
    const promptContent = `---
provider: anthropic
model: claude-sonnet-4-20250514
providerOptions:
  thinking:
    type: enabled
    budget_tokens: 1500
---

<user>Hello</user>`;

    loadContent.mockReturnValue( { content: promptContent, dir: '/mock/dir' } );

    // budget_tokens is silently stripped from thinking (unknown field), not rejected
    expect( () => {
      loadPrompt( 'test', {} );
    } ).not.toThrow();
  } );

} );
