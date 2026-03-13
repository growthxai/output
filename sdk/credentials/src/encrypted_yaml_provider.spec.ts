import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dump as stringifyYaml } from 'js-yaml';
import { encrypt, generateKey } from './encryption.js';

const YAML_CONTENT = stringifyYaml( {
  db: { host: 'localhost', password: 'secret' }
} );

const SAVED_ENV: Record<string, string | undefined> = {};
const SAVED_ARGV2 = process.argv[2];
const ENV_KEYS = [
  'OUTPUT_CREDENTIALS_KEY', 'OUTPUT_CREDENTIALS_KEY_PRODUCTION',
  'OUTPUT_CREDENTIALS_KEY_MY_WORKFLOW', 'NODE_ENV'
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

const loadProvider = async () => {
  vi.resetModules();
  const mod = await import( './encrypted_yaml_provider.js' );
  return mod.encryptedYamlProvider;
};

describe( 'encrypted YAML provider', () => {
  const key = generateKey();
  const ciphertext = encrypt( YAML_CONTENT, key );

  beforeEach( () => {
    saveEnv();
    clearEnv();
  } );

  afterEach( () => {
    restoreEnv();
    process.argv[2] = SAVED_ARGV2;
  } );

  describe( 'loadGlobal', () => {
    it( 'should decrypt and parse YAML credentials', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const provider = await loadProvider();
      const result = provider.loadGlobal( { environment: undefined } );

      expect( result ).toEqual( { db: { host: 'localhost', password: 'secret' } } );
    } );

    it( 'should return empty object when no credentials file exists', async () => {
      vi.doMock( 'node:fs', () => ( {
        readFileSync: vi.fn(),
        existsSync: () => false
      } ) );

      const provider = await loadProvider();
      expect( provider.loadGlobal( { environment: undefined } ) ).toEqual( {} );
    } );

    it( 'should use environment-specific path when provided', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY_PRODUCTION = key;
      const paths: string[] = [];

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => {
          paths.push( path );
          return path.includes( 'credentials/production.yml.enc' );
        }
      } ) );

      const provider = await loadProvider();
      provider.loadGlobal( { environment: 'production' } );

      expect( paths.some( p => p.includes( 'credentials/production.yml.enc' ) ) )
        .toBe( true );
    } );

    it( 'should throw MissingKeyError when no key available', async () => {
      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const provider = await loadProvider();
      expect( () => provider.loadGlobal( { environment: undefined } ) )
        .toThrow( 'No credentials key found' );
    } );
  } );

  describe( 'loadForWorkflow', () => {
    it( 'should return null when workflowDir is undefined', async () => {
      const provider = await loadProvider();
      const result = provider.loadForWorkflow( {
        workflowName: 'test',
        workflowDir: undefined
      } );
      expect( result ).toBeNull();
    } );

    it( 'should return null when no workflow credentials file exists', async () => {
      vi.doMock( 'node:fs', () => ( {
        readFileSync: vi.fn(),
        existsSync: () => false
      } ) );

      const provider = await loadProvider();
      const result = provider.loadForWorkflow( {
        workflowName: 'test',
        workflowDir: '/app/workflows/test'
      } );
      expect( result ).toBeNull();
    } );

    it( 'should decrypt workflow-specific credentials', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const provider = await loadProvider();
      const result = provider.loadForWorkflow( {
        workflowName: 'my_workflow',
        workflowDir: '/app/workflows/my_workflow'
      } );

      expect( result ).toEqual( { db: { host: 'localhost', password: 'secret' } } );
    } );

    it( 'should use workflow-specific env var key when set', async () => {
      const workflowKey = generateKey();
      const workflowCipher = encrypt( YAML_CONTENT, workflowKey );
      process.env.OUTPUT_CREDENTIALS_KEY_MY_WORKFLOW = workflowKey;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => workflowCipher,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const provider = await loadProvider();
      const result = provider.loadForWorkflow( {
        workflowName: 'my_workflow',
        workflowDir: '/app/workflows/my_workflow'
      } );

      expect( result ).toEqual( { db: { host: 'localhost', password: 'secret' } } );
    } );
  } );
} );
