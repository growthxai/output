import { workflow, z } from '@outputai/core';
import { formatLabel, scaleValue } from './steps.js';

export default workflow( {
  name: 'schema_parsing',
  description: 'Exercises Zod parse behavior on workflow and step schemas',
  inputSchema: z.object( {
    count: z.coerce.number().default( 1 ),
    label: z.string().default( 'Item' )
  } ),
  outputSchema: z.object( {
    total: z.number(),
    label: z.string(),
    currency: z.string().default( 'USD' ),
    workflowId: z.string()
  } ),
  fn: async ( input, context ) => {
    // Unknown keys are stripped by the step inputSchema (cast: TS rejects excess props on z.input).
    const scaled = await scaleValue( {
      value: input.count,
      ignoredByStep: true
    } as { value: number } );
    const label = await formatLabel( `  ${input.label}  ` );

    return {
      total: scaled.product,
      label,
      workflowId: context.info.workflowId,
      internalNote: 'dropped-by-workflow-output-schema'
      // currency omitted -> workflow output default
    };
  }
} );
