import { Client, Connection } from '@temporalio/client';
import { temporal as temporalConfig } from '#configs';
import { logger } from '#logger';
import { getWorkflowMethods } from './workflow/index.js';

const { address, apiKey, namespace, grpcMaxMessageSizeBytes } = temporalConfig;

export default {

  /**
   * Status the client and returns the methods to interact with Temporal
   */
  async init() {
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
      }
    } );
    const client = new Client( { connection, namespace } );

    logger.info( 'Temporal client connected', { address, namespace } );

    return {
      /**
       * Shutdown this client
       * @returns {void}
       */
      async close() {
        await connection.close();
      },

      /** Workflow actions */
      workflow: getWorkflowMethods( { client, connection } )
    };
  }
};
