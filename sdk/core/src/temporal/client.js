import { Client } from '@temporalio/client';
import { Storage } from '#async_storage';
import { FatalError } from '#errors';

// store the instance creation configs
const config = {
  connection: null,
  namespace: null
};

// store a single instance that is created on demand
const instance = {
  client: null
};

// Adds the config necessary to init Clients
export const setupClientConfig = ( { connection, namespace } ) => {
  config.connection = new Proxy( connection, {
    get( target, property, receiver ) {
      if ( property === 'close' ) {
        return async () => {
          throw new FatalError( 'Client connection cannot be closed. It is owned by the worker.' );
        };
      }
      return Reflect.get( target, property, receiver );
    }
  } );
  config.namespace = namespace;
};

/** Return a new Temporal client instance */
export const createTemporalClient = () => {
  if ( !config.connection ) {
    throw new FatalError( 'createTemporalClient() can only be called from within the worker runtime.' );
  }
  return new Client( { ...config } );
};

/** Get the workflow handle for the current workflow execution */
export const getCurrentWorkflowHandle = () => {
  const ctx = Storage.load();
  if ( !ctx || !config.connection ) {
    throw new FatalError( 'getCurrentWorkflowHandle() can only be called from Temporal activities running in the worker.' );
  }
  const { workflowId, runId } = ctx.activityInfo.workflowExecution;
  return ( instance.client ??= new Client( config ) ).workflow.getHandle( workflowId, runId );
};
