import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dump as stringifyYaml } from 'js-yaml';
import { deepMerge } from '../helpers/object.js';
import { credentials, resolveCredentialRefs } from './credentials.js';
import { encryptedYamlProvider } from './encrypted_yaml_provider.js';
import { encrypt, generateKey } from './encryption.js';
import { getNestedValue } from './paths.js';
import { setProvider } from './provider_registry.js';

const GLOBAL_YAML = stringifyYaml( {
  test: { secret: 'credentials_are_working', nested: { deep_value: 42 } }
} );

const WORKFLOW_YAML = stringifyYaml( {
  test: { secret: 'workflow_specific_secret' },
  workflow_only: { value: 'per_workflow_data' }
} );

const KEY_ENV_VARS = [ 'OUTPUT_CREDENTIALS_KEY', 'OUTPUT_CREDENTIALS_KEY_DEMO' ];

describe( 'real encrypted credentials', () => {
  const savedArgv2 = process.argv[2];
  const savedEnv: Record<string, string | undefined> = {};
  const rootDir = mkdtempSync( join( tmpdir(), 'output-credentials-' ) );
  const workflowDir = resolve( rootDir, 'src/workflows/demo' );

  beforeAll( () => {
    const key = generateKey();

    mkdirSync( resolve( rootDir, 'config' ), { recursive: true } );
    mkdirSync( workflowDir, { recursive: true } );
    writeFileSync( resolve( rootDir, 'config/credentials.key' ), key );
    writeFileSync( resolve( rootDir, 'config/credentials.yml.enc' ), encrypt( GLOBAL_YAML, key ) );
    writeFileSync( resolve( workflowDir, 'credentials.yml.enc' ), encrypt( WORKFLOW_YAML, key ) );

    for ( const name of KEY_ENV_VARS ) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }

    // The provider resolves the project root from an absolute argv[2].
    process.argv[2] = rootDir;
    setProvider( encryptedYamlProvider );
  } );

  afterAll( () => {
    process.argv[2] = savedArgv2;
    for ( const name of KEY_ENV_VARS ) {
      if ( savedEnv[name] === undefined ) {
        delete process.env[name];
      } else {
        process.env[name] = savedEnv[name];
      }
    }
    rmSync( rootDir, { recursive: true, force: true } );
  } );

  it( 'should load and decrypt global credentials', () => {
    const global = encryptedYamlProvider.loadGlobal( { environment: undefined } );

    expect( global ).toHaveProperty( 'test' );
    expect( ( global.test as Record<string, unknown> ).secret ).toBe( 'credentials_are_working' );
    expect( ( global.test as Record<string, unknown> ).nested ).toEqual( { deep_value: 42 } );
  } );

  it( 'should load and decrypt per-workflow credentials', () => {
    const workflow = encryptedYamlProvider.loadForWorkflow( {
      workflowName: 'demo',
      workflowDir,
      environment: undefined
    } );

    expect( workflow ).not.toBeNull();
    expect( ( workflow!.test as Record<string, unknown> ).secret ).toBe( 'workflow_specific_secret' );
    expect( workflow!.workflow_only ).toEqual( { value: 'per_workflow_data' } );
  } );

  it( 'should merge global + workflow credentials correctly', () => {
    const global = encryptedYamlProvider.loadGlobal( { environment: undefined } );
    const workflow = encryptedYamlProvider.loadForWorkflow( {
      workflowName: 'demo',
      workflowDir,
      environment: undefined
    } );

    const merged = deepMerge( global, workflow! ) as Record<string, unknown>;

    expect( getNestedValue( merged, 'test.secret' ) ).toBe( 'workflow_specific_secret' );
    expect( getNestedValue( merged, 'test.nested.deep_value' ) ).toBe( 42 );
    expect( getNestedValue( merged, 'workflow_only.value' ) ).toBe( 'per_workflow_data' );
  } );

  it( 'should return undefined for nonexistent paths', () => {
    const global = encryptedYamlProvider.loadGlobal( { environment: undefined } );

    expect( getNestedValue( global, 'nonexistent.key' ) ).toBeUndefined();
  } );

  describe( 'resolveCredentialRefs - credential: env var convention', () => {
    const TEST_VARS = [ 'TEST_CRED_RESOLVED', 'TEST_CRED_PROTECTED', 'TEST_CRED_MISSING' ];

    beforeEach( () => {
      credentials._reset();
      for ( const key of TEST_VARS ) {
        delete process.env[key];
      }
    } );

    afterEach( () => {
      credentials._reset();
      for ( const key of TEST_VARS ) {
        delete process.env[key];
      }
    } );

    it( 'resolves credential: prefix to the actual credential value', () => {
      process.env.TEST_CRED_RESOLVED = 'credential:test.secret';

      const resolved = resolveCredentialRefs();

      expect( process.env.TEST_CRED_RESOLVED ).toBe( 'credentials_are_working' );
      expect( resolved ).toContain( 'TEST_CRED_RESOLVED' );
    } );

    it( 'does not overwrite env vars already set to a real value', () => {
      process.env.TEST_CRED_PROTECTED = 'already-set';

      const resolved = resolveCredentialRefs();

      expect( process.env.TEST_CRED_PROTECTED ).toBe( 'already-set' );
      expect( resolved ).not.toContain( 'TEST_CRED_PROTECTED' );
    } );

    it( 'leaves the placeholder when the credential path does not exist', () => {
      process.env.TEST_CRED_MISSING = 'credential:nonexistent.key';

      resolveCredentialRefs();

      expect( process.env.TEST_CRED_MISSING ).toBe( 'credential:nonexistent.key' );
    } );

    it( 'is idempotent on repeated calls', () => {
      process.env.TEST_CRED_RESOLVED = 'credential:test.secret';

      resolveCredentialRefs();
      expect( process.env.TEST_CRED_RESOLVED ).toBe( 'credentials_are_working' );

      resolveCredentialRefs();
      expect( process.env.TEST_CRED_RESOLVED ).toBe( 'credentials_are_working' );
    } );
  } );
} );
