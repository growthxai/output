import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection } from '@temporalio/client';
import { config } from '#config.js';
import { buildConnectionConfig, createTemporalClient } from './temporal_client.js';

vi.mock( '@temporalio/client', () => ( {
  Connection: { connect: vi.fn() },
  Client: class {
    options: unknown;
    constructor( options: unknown ) {
      this.options = options;
    }
  }
} ) );

const profileFile = `
[profile.prod]
address = "prod.example:7233"
namespace = "prod-ns"
api_key = "secret"

[profile.staging]
address = "staging.example:7233"
namespace = "staging-ns"
`;

describe( 'temporal client', () => {
  const savedEnv = { ...process.env };
  const workspace = { directory: '' };

  const useConfigFile = ( contents: string ) => {
    const file = join( workspace.directory, 'temporal.toml' );
    writeFileSync( file, contents );
    process.env.TEMPORAL_CONFIG_FILE = file;
  };

  beforeEach( () => {
    vi.clearAllMocks();
    Object.keys( process.env ).filter( key => key.startsWith( 'TEMPORAL_' ) ).forEach( key => delete process.env[key] );
    workspace.directory = mkdtempSync( join( tmpdir(), 'temporal-client-' ) );
    useConfigFile( profileFile );
  } );

  afterEach( () => {
    process.env = { ...savedEnv };
    rmSync( workspace.directory, { recursive: true, force: true } );
  } );

  describe( 'buildConnectionConfig', () => {
    it( 'falls back to localhost on the dev Temporal port and the default namespace', () => {
      expect( buildConnectionConfig() ).toMatchObject( { address: `localhost:${config.ports.temporal}`, namespace: 'default' } );
    } );

    it( 'reads the profile named by --profile, including its API key', () => {
      const result = buildConnectionConfig( { profile: 'prod' } );

      expect( result ).toMatchObject( { address: 'prod.example:7233', namespace: 'prod-ns' } );
      expect( result.connectionOptions ).toMatchObject( { address: 'prod.example:7233', apiKey: 'secret' } );
    } );

    it( 'reads the profile named by TEMPORAL_PROFILE', () => {
      process.env.TEMPORAL_PROFILE = 'staging';

      expect( buildConnectionConfig() ).toMatchObject( { address: 'staging.example:7233', namespace: 'staging-ns' } );
    } );

    it( 'lets the TEMPORAL_* environment override the profile', () => {
      process.env.TEMPORAL_ADDRESS = 'env.example:7233';
      process.env.TEMPORAL_NAMESPACE = 'env-ns';

      expect( buildConnectionConfig( { profile: 'prod' } ) ).toMatchObject( { address: 'env.example:7233', namespace: 'env-ns' } );
    } );

    it( 'lets the flags override the environment and the profile', () => {
      process.env.TEMPORAL_ADDRESS = 'env.example:7233';
      process.env.TEMPORAL_NAMESPACE = 'env-ns';

      const result = buildConnectionConfig( { profile: 'prod', address: 'flag.example:7233', namespace: 'flag-ns' } );

      expect( result ).toMatchObject( { address: 'flag.example:7233', namespace: 'flag-ns' } );
    } );

    it( 'throws for a profile that does not exist', () => {
      expect( () => buildConnectionConfig( { profile: 'missing' } ) ).toThrow();
    } );
  } );

  describe( 'createTemporalClient', () => {
    it( 'connects with a timeout and hands back the address, the namespace and a close function', async () => {
      const close = vi.fn().mockResolvedValue( undefined );
      vi.mocked( Connection.connect ).mockResolvedValue( { close } as never );

      const handle = await createTemporalClient( { profile: 'prod' } );

      expect( Connection.connect ).toHaveBeenCalledWith(
        expect.objectContaining( { address: 'prod.example:7233', apiKey: 'secret', connectTimeout: '5s' } )
      );
      expect( handle ).toMatchObject( { address: 'prod.example:7233', namespace: 'prod-ns' } );
      expect( handle.client ).toMatchObject( { options: { namespace: 'prod-ns' } } );

      await handle.close();
      expect( close ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'names the address when the connection fails and keeps the cause', async () => {
      const cause = new Error( 'connection refused' );
      vi.mocked( Connection.connect ).mockRejectedValue( cause );

      const failure = await createTemporalClient( { address: 'nope.example:7233' } ).catch( ( error: Error ) => error );

      expect( failure ).toMatchObject( { message: 'Cannot connect to Temporal at nope.example:7233: connection refused', cause } );
    } );
  } );
} );
