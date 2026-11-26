import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, WorkflowNotFoundError } from '@temporalio/client';
import { config } from '#config.js';
import type { Client } from '@temporalio/client';
import { buildConnectionConfig, callTemporal, createTemporalClient, formatTemporalError } from './temporal_client.js';

vi.mock( '@temporalio/client', async importOriginal => ( {
  WorkflowNotFoundError: ( await importOriginal<typeof import( '@temporalio/client' )>() ).WorkflowNotFoundError,
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

    it( 'treats an empty environment API key as unset for local Temporal', () => {
      process.env.TEMPORAL_API_KEY = '';
      expect( buildConnectionConfig().connectionOptions ).toMatchObject( { apiKey: undefined, tls: undefined } );
    } );

    it( 'keeps the profile key and explicit TLS config when the environment key is empty', () => {
      process.env.TEMPORAL_API_KEY = '';
      useConfigFile( `${profileFile}\n[profile.prod.tls]\nserver_name = "prod.example"\n` );

      expect( buildConnectionConfig( { profile: 'prod' } ).connectionOptions ).toMatchObject( {
        apiKey: 'secret',
        tls: { serverNameOverride: 'prod.example' }
      } );
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

  describe( 'callTemporal', () => {
    const buildClient = ( withDeadline: ( deadline: number, call: () => Promise<unknown> ) => Promise<unknown> ) => (
      { connection: { withDeadline: vi.fn( withDeadline ) } } as unknown as Client
    );

    it( 'runs the call under a deadline in the future and returns its result', async () => {
      const client = buildClient( ( _deadline, call ) => call() );

      await expect( callTemporal( client, async () => 'done' ) ).resolves.toBe( 'done' );

      const deadline = vi.mocked( client.connection.withDeadline ).mock.calls[0][0] as number;
      expect( deadline ).toBeGreaterThan( Date.now() );
      expect( deadline ).toBeLessThanOrEqual( Date.now() + 30_000 );
    } );

    it( 'says Temporal did not answer when the deadline passes, and keeps the cause', async () => {
      const cause = Object.assign( new Error( '4 DEADLINE_EXCEEDED: Deadline exceeded' ), { code: 4 } );
      const client = buildClient( async () => {
        throw cause;
      } );

      const failure = await callTemporal( client, async () => 'done' ).catch( ( error: Error ) => error );

      expect( failure ).toMatchObject( { message: 'Temporal did not answer within 30s', cause } );
    } );

    it( 'rethrows any other failure untouched', async () => {
      const failure = Object.assign( new Error( 'permission denied' ), { code: 7 } );
      const client = buildClient( async () => {
        throw failure;
      } );

      await expect( callTemporal( client, async () => 'done' ) ).rejects.toBe( failure );
    } );
  } );

  describe( 'formatTemporalError', () => {
    it( 'says what to check for a workflow or run that is not found', () => {
      const missing = new WorkflowNotFoundError( 'workflow not found for ID: wf-1', 'wf-1', undefined );

      expect( formatTemporalError( missing ) ).toBe( 'Workflow not found for ID: wf-1. Check the workflow id, the run id and the namespace.' );
    } );

    it( 'reports any other error by its message', () => {
      expect( formatTemporalError( new Error( 'Temporal did not answer within 30s' ) ) ).toBe( 'Temporal did not answer within 30s' );
    } );

    it( 'reports a value that is not an error as text', () => {
      expect( formatTemporalError( 'boom' ) ).toBe( 'boom' );
    } );
  } );
} );
