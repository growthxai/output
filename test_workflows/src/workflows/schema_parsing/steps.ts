import { step, z } from '@outputai/core';

/**
 * Coerce/default on input; default + strip unknown keys on output.
 */
export const scaleValue = step( {
  name: 'scale_value',
  description: 'Scale a value with schema defaults and output field stripping',
  inputSchema: z.object( {
    value: z.coerce.number().default( 1 ),
    factor: z.number().default( 10 )
  } ),
  outputSchema: z.object( {
    product: z.number(),
    unit: z.string().default( 'x' )
  } ),
  fn: async input => ( {
    product: input.value * input.factor,
    scratch: 'dropped-by-output-schema'
  } )
} );

/**
 * Deterministic string transforms on both input and output.
 */
export const formatLabel = step( {
  name: 'format_label',
  description: 'Normalize a label on input and prefix it on output',
  inputSchema: z.string().transform( value => value.trim().toLowerCase() ),
  outputSchema: z.string().transform( value => `label:${value}` ),
  fn: async label => label
} );
