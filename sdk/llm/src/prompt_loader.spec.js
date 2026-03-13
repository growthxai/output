import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPrompt } from './prompt_loader.js';

// Mock dependencies that perform I/O or validation
vi.mock( './load_content.js', () => ( {
  loadContent: vi.fn()
} ) );

vi.mock( './prompt_validations.js', () => ( {
  validatePrompt: vi.fn()
} ) );

import { loadContent } from './load_content.js';
import { validatePrompt } from './prompt_validations.js';

describe( 'loadPrompt', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'loads prompt file and renders with variables', () => {
    const promptContent = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
---
<user>Hello {{ name }}!</user>`;

    loadContent.mockReturnValue( promptContent );

    const result = loadPrompt( 'test', { name: 'World' } );

    expect( result.name ).toBe( 'test' );
    expect( result.config ).toEqual( { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' } );
    expect( result.messages ).toHaveLength( 1 );
    expect( result.messages[0].content ).toBe( 'Hello World!' );
    expect( validatePrompt ).toHaveBeenCalledWith( result );
  } );

  it( 'throws error when prompt file not found', () => {
    loadContent.mockReturnValue( null );

    expect( () => {
      loadPrompt( 'nonexistent' );
    } ).toThrow( /Prompt nonexistent not found/ );
  } );

} );

describe( 'loadPrompt - template hydration in headers (integration tests)', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'should hydrate template variables in YAML headers', () => {
    const promptContent = `---
provider: {{ provider_name }}
model: {{ model_id }}
temperature: 0.7
---

<user>Hello</user>`;

    loadContent.mockReturnValue( promptContent );

    const result = loadPrompt( 'test', {
      provider_name: 'anthropic',
      model_id: 'claude-sonnet-4'
    } );

    expect( result.config.provider ).toBe( 'anthropic' );
    expect( result.config.model ).toBe( 'claude-sonnet-4' );
    expect( result.config.temperature ).toBe( 0.7 );
  } );

  it( 'should hydrate template variables in both headers and messages', () => {
    const promptContent = `---
provider: {{ provider }}
model: {{ model }}
---

<user>Tell me about {{ topic }}</user>`;

    loadContent.mockReturnValue( promptContent );

    const result = loadPrompt( 'test', {
      provider: 'openai',
      model: 'gpt-4',
      topic: 'testing'
    } );

    expect( result.config.provider ).toBe( 'openai' );
    expect( result.config.model ).toBe( 'gpt-4' );
    expect( result.messages[0].content ).toBe( 'Tell me about testing' );
  } );

  it( 'should render undefined template variables as null', () => {
    const promptContent = `---
provider: {{ undefined_var }}
model: claude-3-5-sonnet-20241022
---

<user>Hello</user>`;

    loadContent.mockReturnValue( promptContent );

    const result = loadPrompt( 'test', {} );

    // Liquid renders undefined variables as empty, which becomes null in YAML
    expect( result.config.provider ).toBe( null );
    expect( result.config.model ).toBe( 'claude-3-5-sonnet-20241022' );
  } );

  it( 'should handle complex template expressions in headers', () => {
    const promptContent = `---
provider: anthropic
model: {{ base_model }}-{{ version }}
temperature: 0.7
---

<user>Hello</user>`;

    loadContent.mockReturnValue( promptContent );

    const result = loadPrompt( 'test', {
      base_model: 'claude-sonnet',
      version: '4'
    } );

    expect( result.config.model ).toBe( 'claude-sonnet-4' );
  } );

  it( 'should use camelCase config keys', () => {
    const promptContent = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
maxTokens: 1024
temperature: 0.7
---

<user>Hello</user>`;

    loadContent.mockReturnValue( promptContent );

    const result = loadPrompt( 'test', {} );

    expect( result.config.maxTokens ).toBe( 1024 );
  } );

  it( 'should render boolean variables correctly', () => {
    const promptContent = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
---

<user>{% if debug %}Debug mode enabled{% else %}Debug mode disabled{% endif %}</user>`;

    loadContent.mockReturnValue( promptContent );

    const result = loadPrompt( 'test', { debug: true } );

    expect( result.messages[0].content ).toBe( 'Debug mode enabled' );
  } );

  it( 'should render false boolean variables', () => {
    const promptContent = `---
provider: anthropic
model: claude-3-5-sonnet-20241022
---

<user>{% if enabled %}Feature enabled{% else %}Feature disabled{% endif %}</user>`;

    loadContent.mockReturnValue( promptContent );

    const result = loadPrompt( 'test', { enabled: false } );

    expect( result.messages[0].content ).toBe( 'Feature disabled' );
  } );

} );
