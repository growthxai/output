import { step } from '@outputai/core';
import { Event } from '@outputai/core/internal/activity';

export const emitEvent = step( {
  name: 'emit_event',
  description: 'Event hub',
  fn: async () => {
    Event.emit( 'custom_event', { hi: 'mark' } );
  }
} );
