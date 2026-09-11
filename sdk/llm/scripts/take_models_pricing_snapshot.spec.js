import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildPricing, takeSnapshot, supportedProviders } from './take_models_pricing_snapshot.js';

vi.mock( 'node:fs', () => ( { writeFileSync: vi.fn() } ) );

const cost = { input: 1, output: 2 };
/* A provider entry as served by models.dev: everything outside `models.<id>.cost` must be dropped. */
const provider = ( models = { 'model-a': { id: 'model-a', name: 'Model A', cost } } ) => ( {
  id: 'openai',
  name: 'OpenAI',
  models
} );
const source = ( overrides = {} ) => ( {
  ...Object.fromEntries( supportedProviders.map( id => [ id, provider() ] ) ),
  ...overrides
} );

describe( 'buildPricing', () => {
  beforeEach( () => {
    vi.useFakeTimers();
    vi.setSystemTime( new Date( '2026-09-10T21:57:36.430Z' ) );
  } );

  afterEach( () => {
    vi.useRealTimers();
  } );

  it( 'keeps only the cost branch of every model', () => {
    const result = buildPricing( source() );

    expect( result.openai ).toEqual( { models: { 'model-a': { cost } } } );
  } );

  it( 'stamps the fetch time and keeps _meta first', () => {
    const result = buildPricing( source() );

    expect( Object.keys( result )[0] ).toBe( '_meta' );
    expect( result._meta ).toEqual( { createdAt: '2026-09-10T21:57:36.430Z' } );
  } );

  it( 'orders providers alphabetically', () => {
    const result = buildPricing( source() );

    expect( Object.keys( result ) ).toEqual( [ '_meta', ...supportedProviders ] );
  } );

  it( 'orders models alphabetically', () => {
    const models = { zeta: { cost }, alpha: { cost }, middle: { cost } };
    const result = buildPricing( source( { openai: provider( models ) } ) );

    expect( Object.keys( result.openai.models ) ).toEqual( [ 'alpha', 'middle', 'zeta' ] );
  } );

  it( 'drops models without cost', () => {
    const models = { free: { id: 'free' }, paid: { cost } };
    const result = buildPricing( source( { openai: provider( models ) } ) );

    expect( Object.keys( result.openai.models ) ).toEqual( [ 'paid' ] );
  } );

  it( 'drops providers outside the supported list', () => {
    const result = buildPricing( source( { xai: provider() } ) );

    expect( result.xai ).toBeUndefined();
  } );

  it( 'throws when a supported provider is absent', () => {
    const { openai, ...rest } = source();

    expect( () => buildPricing( rest ) ).toThrow( 'Source does not have required provider openai.' );
  } );

  it( 'throws when a supported provider has no priced models', () => {
    const withoutPricing = source( { openai: provider( { free: { id: 'free' } } ) } );

    expect( () => buildPricing( withoutPricing ) ).toThrow( 'Provider openai has no models with pricing.' );
  } );

  it( 'throws when a supported provider has no models at all', () => {
    const withoutModels = source( { openai: { id: 'openai' } } );

    expect( () => buildPricing( withoutModels ) ).toThrow( 'Provider openai has no models with pricing.' );
  } );
} );

describe( 'takeSnapshot', () => {
  const fetchMock = vi.fn();

  beforeEach( () => {
    vi.clearAllMocks();
    vi.stubGlobal( 'fetch', fetchMock );
  } );

  afterEach( () => {
    vi.unstubAllGlobals();
  } );

  it( 'writes the snapshot next to the module, newline terminated', async () => {
    fetchMock.mockResolvedValue( { ok: true, json: () => Promise.resolve( source() ) } );

    await takeSnapshot();

    const [ path, content, encoding ] = writeFileSync.mock.calls[0];
    expect( path ).toMatch( /models_pricing_snapshot\.json$/ );
    expect( encoding ).toBe( 'utf-8' );
    expect( content.endsWith( '\n' ) ).toBe( true );
    expect( JSON.parse( content ).openai ).toEqual( { models: { 'model-a': { cost } } } );
  } );

  it( 'throws and writes nothing on an HTTP error', async () => {
    fetchMock.mockResolvedValue( { ok: false, status: 503 } );

    await expect( takeSnapshot() ).rejects.toThrow( 'Data fetch HTTP error 503.' );
    expect( writeFileSync ).not.toHaveBeenCalled();
  } );

  it( 'throws and writes nothing when the payload is unusable', async () => {
    fetchMock.mockResolvedValue( { ok: true, json: () => Promise.resolve( {} ) } );

    await expect( takeSnapshot() ).rejects.toThrow( 'Source does not have required provider' );
    expect( writeFileSync ).not.toHaveBeenCalled();
  } );
} );
