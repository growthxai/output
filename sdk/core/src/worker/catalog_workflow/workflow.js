import { defineQuery, setHandler, condition, defineUpdate } from '@temporalio/workflow';

/**
 * This is a special workflow, unique to each worker, which holds the meta information of all other workflows in that worker.
 *
 * The information is set in the startup and is accessible via a query called 'get'.
 *
 * @param {object} catalog - The catalog information
 */
export default async function catalogWorkflow( catalog ) {
  const state = { canEnd: false };

  // Returns the catalog
  setHandler( defineQuery( 'get' ), () => catalog );

  // Politely respond to a ping
  setHandler( defineQuery( 'ping' ), () => 'pong' );

  // Listen to this update to complete the workflow
  setHandler( defineUpdate( 'complete' ), () => state.canEnd = true );

  // Wait indefinitely, until the state changes
  await condition( () => state.canEnd );
};
