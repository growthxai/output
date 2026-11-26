import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dump as stringifyYaml } from 'js-yaml';
import { encrypt, generateKey } from './encryption.js';

const YAML_CONTENT = stringifyYaml( {
  anthropic: { api_key: 'sk-ant-test' }
} );

const SAVED_ENV: Record<string, string | undefined> = {};
const SAVED_ARGV2 = process.argv[2];
const ENV_KEYS = [
  'OUTPUT_CREDENTIALS_KEY', 'OUTPUT_CREDENTIALS_KEY_PRODUCTION',
  'OUTPUT_CREDENTIALS_KEY_DEVELOPMENT', 'NODE_ENV'
];

const saveEnv = () => ENV_KEYS.forEach( k => {
  SAVED_ENV[k] = process.env[k];
} );
const restoreEnv = () => ENV_KEYS.forEach( k => {
  if ( SAVED_ENV[k] === undefined ) {
    delete process.env[k];
  } else {
    process.env[k] = SAVED_ENV[k];
  }
} );
const clearEnv = () => ENV_KEYS.forEach( k => delete process.env[k] );

describe( 'init', () => {
  const key = generateKey();
  const ciphertext = encrypt( YAML_CONTENT, key );

  beforeEach( () => {
    saveEnv();
    clearEnv();
    process.env.NODE_ENV = 'production';
    vi.resetModules();
  } );

  afterEach( () => {
    restoreEnv();
    process.argv[2] = SAVED_ARGV2;
  } );

  it( 'should throw MissingKeyError when the environment credentials file has no key', async () => {
    vi.doMock( 'node:fs', () => ( {
      readFileSync: () => ciphertext,
      existsSync: ( path: string ) => path.endsWith( 'config/credentials/production.yml.enc' )
    } ) );

    const { init } = await import( './init.js' );
    const { MissingKeyError } = await import( './errors.js' );

    expect( init ).toThrow( MissingKeyError );
  } );

  it( 'should throw MissingKeyError when only the default credentials file has no key', async () => {
    vi.doMock( 'node:fs', () => ( {
      readFileSync: () => ciphertext,
      existsSync: ( path: string ) => path.endsWith( 'config/credentials.yml.enc' )
    } ) );

    const { init } = await import( './init.js' );
    const { MissingKeyError } = await import( './errors.js' );

    expect( init ).toThrow( MissingKeyError );
  } );

  it( 'should initialize without a key when no credentials file exists', async () => {
    vi.doMock( 'node:fs', () => ( {
      readFileSync: () => ciphertext,
      existsSync: () => false
    } ) );

    const { init } = await import( './init.js' );

    expect( init ).not.toThrow();
  } );

  it( 'should throw InvalidCredentialsKeyError when the key does not match the file', async () => {
    process.env.OUTPUT_CREDENTIALS_KEY_PRODUCTION = generateKey();
    vi.doMock( 'node:fs', () => ( {
      readFileSync: () => ciphertext,
      existsSync: ( path: string ) => path.endsWith( 'config/credentials/production.yml.enc' )
    } ) );

    const { init } = await import( './init.js' );
    const { InvalidCredentialsKeyError } = await import( './errors.js' );

    expect( init ).toThrow( InvalidCredentialsKeyError );
  } );

  it( 'should skip the eager load when a custom provider is set', async () => {
    vi.doMock( 'node:fs', () => ( {
      readFileSync: () => ciphertext,
      existsSync: ( path: string ) => path.endsWith( 'config/credentials/production.yml.enc' )
    } ) );

    const { setProvider } = await import( './provider_registry.js' );
    const { init } = await import( './init.js' );

    setProvider( {
      loadGlobal: () => ( {} ),
      loadForWorkflow: () => null
    } );

    expect( init ).not.toThrow();
  } );
} );
