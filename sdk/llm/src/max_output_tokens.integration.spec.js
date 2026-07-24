import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadAiSdkTextOptions } from './ai_sdk_options.js';
import { fetchModelsPricing, cache } from './cost/fetch_models_pricing.js';

// Integration seam: the real resolveModelMaxOutputTokens -> real applyModelMaxOutputDefault
// -> capped maxOutputTokens. Only the network (undici) and provider model loading
// (ai_model.js) are mocked, so a key-format divergence between buildModelMaps
// (`${provider.id}/${modelName}`) and resolveModelMaxOutputTokens (`${provider}/${model}`)
// would surface here where the unit specs mock one side of the seam.
const fetchMock = vi.hoisted( () => vi.fn() );
const EnvHttpProxyAgentMock = vi.hoisted( () => vi.fn() );

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: EnvHttpProxyAgentMock,
  fetch: fetchMock
} ) );

vi.mock( './ai_model.js', () => ( {
  loadTextModel: () => 'MODEL',
  loadImageModel: () => 'IMAGE_MODEL',
  loadTools: () => null
} ) );

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const fixture = JSON.parse( readFileSync( join( __dirname, 'cost', 'fixtures', 'models_api_light.json' ), 'utf8' ) );

const makePrompt = config => ( {
  name: 'test@v1',
  config: { provider: 'anthropic', model: 'claude-opus-4-5-20251101', ...config },
  messages: [ { role: 'user', content: 'Hello' } ],
  instructions: null
} );

describe( 'max output tokens default (integration)', () => {
  beforeEach( () => {
    cache.content = null;
    cache.limits = null;
    cache.expiresAt = 0;
    fetchMock.mockReset().mockResolvedValue( { ok: true, json: () => Promise.resolve( fixture ) } );
  } );

  it( 'injects the models.dev ceiling, capped at 32000, through the real resolver', async () => {
    // Fixture limit.output for this model is 64000; the cap must bring it to 32000.
    await fetchModelsPricing();

    const result = loadAiSdkTextOptions( makePrompt() );

    expect( result.maxOutputTokens ).toBe( 32000 );
  } );

  it( 'lets an explicit maxTokens win over the models.dev default', async () => {
    await fetchModelsPricing();

    const result = loadAiSdkTextOptions( makePrompt( { maxTokens: 500 } ) );

    expect( result.maxOutputTokens ).toBe( 500 );
  } );
} );
