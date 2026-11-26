import { Client, Connection, WorkflowNotFoundError } from '@temporalio/client';
import { loadClientConfigProfile, toClientOptions } from '@temporalio/envconfig';
import { config } from '#config.js';
import type { TemporalFlags } from '#utils/temporal_flags.js';

const DEFAULT_NAMESPACE = 'default';
const CONNECT_TIMEOUT = '5s';
const CALL_TIMEOUT_MS = 30_000;
const GRPC_DEADLINE_EXCEEDED = 4;

export interface TemporalConnectionConfig {
  address: string;
  namespace: string;
  connectionOptions: {
    address: string;
    tls?: unknown;
    apiKey?: string;
    metadata?: Record<string, string>;
  };
}

export interface TemporalClientHandle {
  client: Client;
  address: string;
  namespace: string;
  close: () => Promise<void>;
}

/**
 * Resolves where to connect. Precedence, highest first: flags, TEMPORAL_* env vars, the temporal.toml profile,
 * then the dev stack's Temporal port on localhost (OUTPUT_TEMPORAL_HOST_PORT, 7233 by default) and the default namespace. The profile and env layers are read by `@temporalio/envconfig`; an explicit
 * `--profile` that does not exist throws.
 *
 * @param flags - Shared Temporal flags
 * @returns The effective address and namespace, and the options to open the connection with
 */
export function buildConnectionConfig( flags: TemporalFlags = {} ): TemporalConnectionConfig {
  const { TEMPORAL_API_KEY, ...envWithoutApiKey } = process.env;
  const profile = loadClientConfigProfile( {
    profile: flags.profile,
    overrideEnvVars: TEMPORAL_API_KEY === '' ? envWithoutApiKey as Record<string, string> : undefined
  } );
  const { connectionOptions, namespace } = toClientOptions( {
    ...profile,
    ...( flags.address ? { address: flags.address } : {} ),
    ...( flags.namespace ? { namespace: flags.namespace } : {} )
  } );
  const address = connectionOptions.address ?? `localhost:${config.ports.temporal}`;

  return {
    address,
    namespace: namespace ?? DEFAULT_NAMESPACE,
    connectionOptions: {
      address,
      tls: connectionOptions.tls,
      apiKey: connectionOptions.apiKey,
      metadata: connectionOptions.metadata as Record<string, string> | undefined
    }
  };
}

/**
 * Opens a Temporal client from the shared flags. Callers must call `close()` when done.
 *
 * @param flags - Shared Temporal flags
 * @returns The client, the address and namespace it uses, and a close function
 */
export async function createTemporalClient( flags: TemporalFlags = {} ): Promise<TemporalClientHandle> {
  const { address, namespace, connectionOptions } = buildConnectionConfig( flags );

  const connection = await Connection.connect( { ...connectionOptions, connectTimeout: CONNECT_TIMEOUT } as Parameters<typeof Connection.connect>[0] )
    .catch( ( error: unknown ) => {
      throw new Error( `Cannot connect to Temporal at ${address}: ${error instanceof Error ? error.message : String( error )}`, { cause: error } );
    } );

  return {
    client: new Client( { connection, namespace } ),
    address,
    namespace,
    close: () => connection.close()
  };
}

/**
 * Runs one Temporal call under a deadline, so an unresponsive server cannot hang the command.
 *
 * @param client - The Temporal client the call goes through
 * @param call - The call to run; every request it makes shares the deadline
 * @returns What the call returns
 */
export const callTemporal = async <T>( client: Client, call: () => Promise<T> ): Promise<T> => {
  try {
    return await client.connection.withDeadline( Date.now() + CALL_TIMEOUT_MS, call );
  } catch ( error ) {
    if ( ( error as { code?: number } )?.code === GRPC_DEADLINE_EXCEEDED ) {
      throw new Error( `Temporal did not answer within ${CALL_TIMEOUT_MS / 1000}s`, { cause: error } );
    }
    throw error;
  }
};

/**
 * Builds the message a command prints for a failed Temporal read. A workflow or run that is not found says what to check.
 * Anything else is reported as it is.
 *
 * @param error - The failure
 * @returns The message for stderr
 */
export function formatTemporalError( error: unknown ): string {
  if ( error instanceof WorkflowNotFoundError ) {
    return `${error.message.charAt( 0 ).toUpperCase()}${error.message.slice( 1 )}. Check the workflow id, the run id and the namespace.`;
  }
  return error instanceof Error ? error.message : String( error );
}
