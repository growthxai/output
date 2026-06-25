import { workflow } from '@outputai/core';
import { emitEvent } from './steps.js';

export default workflow( {
  name: 'event_hub',
  description: 'Demo the event hub feature',
  fn: async () => {
    await emitEvent();
  }
} );
