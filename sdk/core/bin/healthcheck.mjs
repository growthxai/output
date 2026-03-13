#!/usr/bin/env node

/*
Healthcheck

Send a "ping" query to the catalog workflow; exit with 0 if result is "pong", 1 otherwise.
*/

import { Connection, Client } from '@temporalio/client';

const address = process.env.TEMPORAL_ADDRESS;
const namespace = process.env.TEMPORAL_NAMESPACE ?? 'default';
const apiKey = process.env.TEMPORAL_API_KEY;
const catalogId = process.env.OUTPUT_CATALOG_ID ?? 'main';

const state = { connection: null };

const code = await ( async () => {
  try {
    state.connection = await Connection.connect( { address, tls: Boolean( apiKey ), apiKey } );
    const client = new Client( { connection: state.connection, namespace } );
    const handle = client.workflow.getHandle( catalogId );
    const response = await handle.query( 'ping' );
    console.log( `Query response: ${response}` );
    return response === 'pong' ? 0 : 1;
  } catch ( error ) {
    console.error( 'Healthcheck error', error );
    return 1;
  } finally {
    if ( state.connection ) {
      await state.connection.close().catch( () => {} );
    }
  }
} )();

process.exit( code );
