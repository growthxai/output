import { workflow, z } from '@outputai/core';
import { generateWithBrokenTool } from './steps.js';

export default workflow( {
  name: 'generate_text_tool_error',
  description: 'generateText must bill the steps already spent when a tool throws mid-loop',
  outputSchema: z.string(),
  fn: async () => generateWithBrokenTool()
} );
