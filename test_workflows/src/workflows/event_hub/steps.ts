import { step } from '@outputai/core';
import { emitEvent } from '@outputai/core/sdk_activity_integration';

export const emitEventStep = step( {
  name: 'emit_event',
  description: 'Event hub',
  fn: async () => {
    emitEvent( 'custom_event', { hi: 'mark' } );
  }
} );
