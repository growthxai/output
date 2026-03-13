import { workflow } from '@outputai/core';
import { emitEventStep } from './steps.js';

export default workflow( {
  name: 'event_hub',
  description: 'Demo the event hub feature',
  fn: async () => {
    await emitEventStep();
  }
} );
