import { step } from '@outputai/core';
import { Event } from '@outputai/core/sdk/runtime';

export const emitEvent = step( {
  name: 'emit_event',
  description: 'Event hub',
  fn: async () => {
    Event.emit( 'custom_event', { hi: 'mark' } );
  }
} );
