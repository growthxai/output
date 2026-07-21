import { Logger, workflow } from '@outputai/core';
import { condition, defineSignal, setHandler } from '@temporalio/workflow';
import { testTemporalClient } from './steps.js';

const currentHandleReady = defineSignal( 'currentHandleReady' );
const clientReady = defineSignal( 'clientReady' );

export default workflow( {
  name: 'temporal_client',
  description: 'Test activity-side Temporal client access',
  fn: async () => {
    const state = {
      currentHandleReady: false,
      clientReady: false
    };

    setHandler( currentHandleReady, () => {
      Logger.info( 'current handle signal received' );
      state.currentHandleReady = true;
    } );
    setHandler( clientReady, () => {
      Logger.info( 'new client signal received' );
      state.clientReady = true;
    } );

    await testTemporalClient();
    await condition( () => state.currentHandleReady && state.clientReady );
  }
} );
