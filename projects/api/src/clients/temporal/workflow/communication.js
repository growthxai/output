/**
 * Query a workflow by name.
 *
 * @param {object} context - Internal Temporal dependencies
 * @param {Client} context.client - Temporal client
 * @param {string} workflowId - The workflow execution id
 * @param {string} queryName - The query name
 * @param {...any} args - Query arguments
 * @returns {Promise<any>} The query result
 */
export const query = async ( { client }, workflowId, queryName, ...args ) =>
  client.workflow.getHandle( workflowId ).query( queryName, ...args );

/**
 * Signal a workflow by name.
 *
 * @param {object} context - Internal Temporal dependencies
 * @param {Client} context.client - Temporal client
 * @param {string} workflowId - The workflow execution id
 * @param {string} signalName - The signal name
 * @param {any} payload - Signal payload
 * @returns {Promise<void>}
 */
export const signal = async ( { client }, workflowId, signalName, payload ) => client.workflow
  .getHandle( workflowId ).signal( signalName, payload );

/**
 * Execute a workflow update by name.
 *
 * @param {object} context - Internal Temporal dependencies
 * @param {Client} context.client - Temporal client
 * @param {string} workflowId - The workflow execution id
 * @param {string} updateName - The update name
 * @param {any} payload - Update payload
 * @returns {Promise<any>} The update result
 */
export const executeUpdate = async ( { client }, workflowId, updateName, payload ) => client.workflow
  .getHandle( workflowId ).executeUpdate( updateName, { args: [ payload ] } );
