import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dump as stringifyYaml } from 'js-yaml';
import { encrypt, generateKey } from './encryption.js';

const YAML_CONTENT = stringifyYaml( {
  anthropic: { api_key: 'sk-ant-test' },
  aws: { region: 'us-east-1', secret: 'aws-secret' }
} );

const WORKFLOW_YAML = stringifyYaml( {
  anthropic: { api_key: 'sk-ant-workflow' },
  stripe: { secret_key: 'sk-stripe-wf' }
} );

const SAVED_ENV: Record<string, string | undefined> = {};
const SAVED_ARGV2 = process.argv[2];
const ENV_KEYS = [
  'OUTPUT_CREDENTIALS_KEY', 'OUTPUT_CREDENTIALS_KEY_PRODUCTION',
  'OUTPUT_CREDENTIALS_KEY_DEVELOPMENT', 'OUTPUT_CREDENTIALS_KEY_MY_WORKFLOW',
  'NODE_ENV'
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

const loadCredentials = async () => {
  vi.resetModules();
  const mod = await import( './index.js' );
  return mod.credentials;
};

describe( 'credentials module', () => {
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

  describe( 'get', () => {
    it( 'should return nested value from decrypted YAML', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'anthropic.api_key' ) ).toBe( 'sk-ant-test' );
      expect( credentials.get( 'aws.region' ) ).toBe( 'us-east-1' );
    } );

    it( 'should return default value for missing path', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'nonexistent.key', 'fallback' ) ).toBe( 'fallback' );
    } );

    it( 'should return undefined when path is missing and no default', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'nonexistent' ) ).toBeUndefined();
    } );

    it( 'should return empty object when no credentials file exists', async () => {
      vi.doMock( 'node:fs', () => ( {
        readFileSync: vi.fn(),
        existsSync: () => false
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'anything' ) ).toBeUndefined();
      expect( credentials.get( 'anything', 'default' ) ).toBe( 'default' );
    } );
  } );

  describe( 'require', () => {
    it( 'should return value when credential exists', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.require( 'aws.secret' ) ).toBe( 'aws-secret' );
    } );

    it( 'should throw MissingCredentialError when credential is missing', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      expect( () => credentials.require( 'missing.path' ) )
        .toThrow( 'Required credential not found: "missing.path"' );
    } );
  } );

  describe( 'key resolution', () => {
    it( 'should prefer env var over key file', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      const readFileSync = vi.fn().mockReturnValue( ciphertext );

      vi.doMock( 'node:fs', () => ( {
        readFileSync,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      credentials.get( 'anthropic.api_key' );

      const keyFileCalls = readFileSync.mock.calls.filter( ( c: unknown[] ) => ( c[0] as string ).endsWith( '.key' ) );
      expect( keyFileCalls ).toHaveLength( 0 );
    } );

    it( 'should fall back to key file when env var is not set', async () => {
      const readFileSync = vi.fn().mockImplementation( ( path: string ) => {
        if ( path.endsWith( '.key' ) ) {
          return key;
        }
        return ciphertext;
      } );

      vi.doMock( 'node:fs', () => ( {
        readFileSync,
        existsSync: () => true
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'anthropic.api_key' ) ).toBe( 'sk-ant-test' );
    } );

    it( 'should throw MissingKeyError when no key source is available', async () => {
      vi.doMock( 'node:fs', () => ( {
        readFileSync: vi.fn(),
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      expect( () => credentials.get( 'anything' ) ).toThrow( 'No credentials key found' );
    } );
  } );

  describe( 'environment detection', () => {
    it( 'should read environment-specific file when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.OUTPUT_CREDENTIALS_KEY_PRODUCTION = key;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.includes( 'credentials/production.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'anthropic.api_key' ) ).toBe( 'sk-ant-test' );
    } );

    it( 'should fall back to default when env-specific file does not exist', async () => {
      process.env.NODE_ENV = 'development';
      process.env.OUTPUT_CREDENTIALS_KEY = key;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) =>
          path.endsWith( 'credentials.yml.enc' ) && !path.includes( 'credentials/' )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'anthropic.api_key' ) ).toBe( 'sk-ant-test' );
    } );
  } );

  describe( 'base directory resolution', () => {
    it( 'should use process.argv[2] when it is an absolute path', async () => {
      process.argv[2] = '/app/test_workflows';
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      const paths: string[] = [];

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => {
          paths.push( path );
          return path.endsWith( 'credentials.yml.enc' );
        }
      } ) );

      const credentials = await loadCredentials();
      credentials.get( 'anthropic.api_key' );

      expect( paths.some( p => p.startsWith( '/app/test_workflows/' ) ) ).toBe( true );
    } );

    it( 'should fall back to process.cwd() when argv[2] is not absolute', async () => {
      process.argv[2] = 'credentials';
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      const paths: string[] = [];

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => {
          paths.push( path );
          return path.endsWith( 'credentials.yml.enc' );
        }
      } ) );

      const credentials = await loadCredentials();
      credentials.get( 'anthropic.api_key' );

      expect( paths.some( p => p.startsWith( process.cwd() ) ) ).toBe( true );
      expect( paths.every( p => !p.startsWith( 'credentials/' ) ) ).toBe( true );
    } );
  } );

  describe( 'caching', () => {
    it( 'should cache loaded credentials across multiple get calls', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      const readFileSync = vi.fn().mockReturnValue( ciphertext );

      vi.doMock( 'node:fs', () => ( {
        readFileSync,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      credentials.get( 'anthropic.api_key' );
      credentials.get( 'aws.region' );
      credentials.get( 'aws.secret' );

      expect( readFileSync ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'should re-read after _reset()', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      const readFileSync = vi.fn().mockReturnValue( ciphertext );

      vi.doMock( 'node:fs', () => ( {
        readFileSync,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const credentials = await loadCredentials();
      credentials.get( 'anthropic.api_key' );
      credentials._reset();
      credentials.get( 'anthropic.api_key' );

      expect( readFileSync ).toHaveBeenCalledTimes( 2 );
    } );
  } );

  describe( 'per-workflow credentials', () => {
    const workflowKey = generateKey();
    const workflowCiphertext = encrypt( WORKFLOW_YAML, workflowKey );

    it( 'should load workflow-specific credentials and deep-merge with global', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: ( path: string ) => {
          if ( path.includes( '/workflows/my_workflow/credentials.yml.enc' ) ) {
            return workflowCiphertext;
          }
          if ( path.includes( '/workflows/my_workflow/credentials.key' ) ) {
            return workflowKey;
          }
          return ciphertext;
        },
        existsSync: ( path: string ) =>
          path.endsWith( 'credentials.yml.enc' ) ||
          path.includes( '/workflows/my_workflow/credentials.key' )
      } ) );

      vi.doMock( '@outputai/core/sdk_activity_integration', () => ( {
        getExecutionContext: () => ( { workflow: { id: 'test-id', name: 'my_workflow', filename: '/app/src/workflows/my_workflow/workflow.ts' } } )
      } ) );

      const credentials = await loadCredentials();

      expect( credentials.get( 'anthropic.api_key' ) ).toBe( 'sk-ant-workflow' );
      expect( credentials.get( 'stripe.secret_key' ) ).toBe( 'sk-stripe-wf' );
      expect( credentials.get( 'aws.region' ) ).toBe( 'us-east-1' );
    } );

    it( 'should fall back to global when workflow has no credentials file', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) =>
          path.endsWith( 'credentials.yml.enc' ) && !path.includes( '/workflows/' )
      } ) );

      vi.doMock( '@outputai/core/sdk_activity_integration', () => ( {
        getExecutionContext: () => ( { workflow: { id: 'test-id', name: 'simple', filename: '/app/src/workflows/simple/workflow.ts' } } )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'anthropic.api_key' ) ).toBe( 'sk-ant-test' );
    } );

    it( 'should use global key when workflow has no key file', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      const sharedCiphertext = encrypt( WORKFLOW_YAML, key );

      vi.doMock( 'node:fs', () => ( {
        readFileSync: ( path: string ) => {
          if ( path.includes( '/workflows/my_workflow/credentials.yml.enc' ) ) {
            return sharedCiphertext;
          }
          return ciphertext;
        },
        existsSync: ( path: string ) => {
          if ( path.includes( '/workflows/my_workflow/credentials.key' ) ) {
            return false;
          }
          return path.endsWith( 'credentials.yml.enc' );
        }
      } ) );

      vi.doMock( '@outputai/core/sdk_activity_integration', () => ( {
        getExecutionContext: () => ( { workflow: { id: 'test-id', name: 'my_workflow', filename: '/app/src/workflows/my_workflow/workflow.ts' } } )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'stripe.secret_key' ) ).toBe( 'sk-stripe-wf' );
    } );

    it( 'should use workflow-specific env var key when set', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      process.env.OUTPUT_CREDENTIALS_KEY_MY_WORKFLOW = workflowKey;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: ( path: string ) => {
          if ( path.includes( '/workflows/my_workflow/credentials.yml.enc' ) ) {
            return workflowCiphertext;
          }
          return ciphertext;
        },
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      vi.doMock( '@outputai/core/sdk_activity_integration', () => ( {
        getExecutionContext: () => ( { workflow: { id: 'test-id', name: 'my_workflow', filename: '/app/src/workflows/my_workflow/workflow.ts' } } )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'stripe.secret_key' ) ).toBe( 'sk-stripe-wf' );
    } );

    it( 'should isolate cache between different workflows', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;

      const otherYaml = stringifyYaml( { custom: { value: 'other-wf' } } );
      const otherCiphertext = encrypt( otherYaml, key );

      vi.doMock( 'node:fs', () => ( {
        readFileSync: ( path: string ) => {
          if ( path.includes( '/workflows/workflow_a/credentials.yml.enc' ) ) {
            return encrypt( stringifyYaml( { custom: { value: 'wf-a' } } ), key );
          }
          if ( path.includes( '/workflows/workflow_b/credentials.yml.enc' ) ) {
            return otherCiphertext;
          }
          return ciphertext;
        },
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      const ctx: { name: string | undefined; filename: string | undefined } = { name: undefined, filename: undefined };

      vi.doMock( '@outputai/core/sdk_activity_integration', () => ( {
        getExecutionContext: () => ctx.name ? { workflow: { id: 'test-id', name: ctx.name, filename: ctx.filename } } : null
      } ) );

      const credentials = await loadCredentials();

      ctx.name = 'workflow_a';
      ctx.filename = '/app/src/workflows/workflow_a/workflow.ts';
      expect( credentials.get( 'custom.value' ) ).toBe( 'wf-a' );

      ctx.name = 'workflow_b';
      ctx.filename = '/app/src/workflows/workflow_b/workflow.ts';
      expect( credentials.get( 'custom.value' ) ).toBe( 'other-wf' );
    } );

    it( 'should use global credentials when outside activity context', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;

      vi.doMock( 'node:fs', () => ( {
        readFileSync: () => ciphertext,
        existsSync: ( path: string ) => path.endsWith( 'credentials.yml.enc' )
      } ) );

      vi.doMock( '@outputai/core/sdk_activity_integration', () => ( {
        getExecutionContext: () => null
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'anthropic.api_key' ) ).toBe( 'sk-ant-test' );
    } );

    it( 'should clear all cached scopes on _reset()', async () => {
      process.env.OUTPUT_CREDENTIALS_KEY = key;
      const readFileSync = vi.fn().mockReturnValue( ciphertext );

      vi.doMock( 'node:fs', () => ( {
        readFileSync,
        existsSync: ( path: string ) =>
          path.endsWith( 'credentials.yml.enc' ) && !path.includes( '/workflows/' )
      } ) );

      vi.doMock( '@outputai/core/sdk_activity_integration', () => ( {
        getExecutionContext: () => ( { workflow: { id: 'test-id', name: 'test_wf', filename: '/app/src/workflows/test_wf/workflow.ts' } } )
      } ) );

      const credentials = await loadCredentials();
      credentials.get( 'anthropic.api_key' );
      credentials._reset();
      credentials.get( 'anthropic.api_key' );

      expect( readFileSync ).toHaveBeenCalledTimes( 2 );
    } );
  } );

  describe( 'custom provider', () => {
    it( 'should use a custom provider when set via registry', async () => {
      const customProvider = {
        loadGlobal: () => ( { custom: { key: 'from-provider' } } ),
        loadForWorkflow: () => null
      };

      vi.doMock( './encrypted_yaml_provider.js', () => ( {
        encryptedYamlProvider: customProvider
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'custom.key' ) ).toBe( 'from-provider' );
    } );

    it( 'should deep-merge workflow provider data over global', async () => {
      const customProvider = {
        loadGlobal: () => ( { shared: 'global', base: { a: 1, b: 2 } } ),
        loadForWorkflow: () => ( { base: { b: 99 }, extra: 'wf-only' } )
      };

      vi.doMock( './encrypted_yaml_provider.js', () => ( {
        encryptedYamlProvider: customProvider
      } ) );

      vi.doMock( '@outputai/core/sdk_activity_integration', () => ( {
        getExecutionContext: () => ( { workflow: { id: 'test-id', name: 'test', filename: '/app/workflows/test/workflow.ts' } } )
      } ) );

      const credentials = await loadCredentials();
      expect( credentials.get( 'shared' ) ).toBe( 'global' );
      expect( credentials.get( 'base.a' ) ).toBe( 1 );
      expect( credentials.get( 'base.b' ) ).toBe( 99 );
      expect( credentials.get( 'extra' ) ).toBe( 'wf-only' );
    } );
  } );
} );
