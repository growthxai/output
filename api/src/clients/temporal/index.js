import { Client, Connection } from '@temporalio/client';
import { temporal as temporalConfig } from '#configs';
import { logger } from '#logger';
import { getWorkflowMethods } from './workflow/index.js';
import { ConnectionMonitor } from './connection_monitor.js';

const { address, apiKey, namespace, grpcMaxMessageSizeBytes } = temporalConfig;

export default {

  /**
   * Status the client and returns the methods to interact with Temporal
   */
  async init( { onConnectionLost } = {} ) {
    logger.info( 'Temporal client connecting', { address, namespace, grpcMaxMessageSizeBytes } );

    // enable TLS only when connecting to remote (api key is present)
    // channelArgs raises gRPC's 4 MiB default cap so large result envelopes flow through.
    const connection = await Connection.connect( {
      address,
      tls: Boolean( apiKey ),
      apiKey,
      channelArgs: {
        'grpc.max_receive_message_length': grpcMaxMessageSizeBytes,
        'grpc.max_send_message_length': grpcMaxMessageSizeBytes
      },
      connectTimeout: 15_000
    } );
    const client = new Client( { connection, namespace } );

    const monitor = new ConnectionMonitor( connection );
    monitor.onHeartbeat( () => logger.info( 'Connection healthy' ) );
    monitor.onRecover( () => logger.info( 'Connection recovered' ) );
    monitor.onUnhealthy( ( { error, failures } ) => logger.warn( 'Connection unhealthy', { error: error.message, failures } ) );
    monitor.onConnectionLost( onConnectionLost );
    monitor.start();

    logger.info( 'Temporal client connected', { address, namespace } );

    return {
      /**
       * Shutdown this client
       * @returns {void}
       */
      async close() {
        await connection.close();
      },

      /**
       * Returns true if client is ready to accept requests
       */
      isReady() {
        return !monitor.failing;
      },

      /** Workflow actions */
      workflow: getWorkflowMethods( { client, connection } )
    };
  }
};
