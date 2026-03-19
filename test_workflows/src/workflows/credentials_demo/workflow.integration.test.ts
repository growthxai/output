import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { encryptedYamlProvider, getNestedValue, credentials, resolveCredentialRefs } from '@outputai/credentials';
import { deepMerge } from '@outputai/core/sdk_utils';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const TEST_WORKFLOWS_ROOT = resolve( __dirname, '../../..' );
const WORKFLOW_DIR = __dirname;

describe( 'credentials_demo - real encrypted credentials', () => {
  const originalCwd = process.cwd();

  beforeAll( () => {
    const globalPath = resolve( TEST_WORKFLOWS_ROOT, 'config/credentials.yml.enc' );
    const keyPath = resolve( TEST_WORKFLOWS_ROOT, 'config/credentials.key' );
    const workflowPath = resolve( WORKFLOW_DIR, 'credentials.yml.enc' );

    if ( !existsSync( globalPath ) || !existsSync( keyPath ) || !existsSync( workflowPath ) ) {
      throw new Error(
        'Encrypted credential files not found. Run: output credentials init'
      );
    }

    // The encrypted YAML provider resolves global credentials from process.cwd()
    // In production, the worker runs from the test_workflows directory
    process.chdir( TEST_WORKFLOWS_ROOT );
  } );

  afterAll( () => {
    process.chdir( originalCwd );
  } );

  it( 'should load and decrypt global credentials', () => {
    const global = encryptedYamlProvider.loadGlobal( { environment: undefined } );

    expect( global ).toHaveProperty( 'test' );
    expect( ( global.test as Record<string, unknown> ).secret ).toBe( 'credentials_are_working' );
    expect( ( global.test as Record<string, unknown> ).nested ).toEqual( { deep_value: 42 } );
  } );

  it( 'should load and decrypt per-workflow credentials', () => {
    const workflow = encryptedYamlProvider.loadForWorkflow( {
      workflowName: 'credentials_demo',
      workflowDir: WORKFLOW_DIR,
      environment: undefined
    } );

    expect( workflow ).not.toBeNull();
    expect( ( workflow!.test as Record<string, unknown> ).secret ).toBe( 'workflow_specific_secret' );
    expect( workflow!.workflow_only ).toEqual( { value: 'per_workflow_data' } );
  } );

  it( 'should merge global + workflow credentials correctly', () => {
    const global = encryptedYamlProvider.loadGlobal( { environment: undefined } );
    const workflow = encryptedYamlProvider.loadForWorkflow( {
      workflowName: 'credentials_demo',
      workflowDir: WORKFLOW_DIR,
      environment: undefined
    } );

    const merged = deepMerge( global, workflow! ) as Record<string, unknown>;

    // Workflow-specific value overrides global
    expect( getNestedValue( merged, 'test.secret' ) ).toBe( 'workflow_specific_secret' );
    // Global value inherited (not present in workflow credentials)
    expect( getNestedValue( merged, 'test.nested.deep_value' ) ).toBe( 42 );
    // Workflow-only value present
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
