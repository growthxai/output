import { ValidationError, z } from '@outputai/core';

const skillArgSchema = z.object( {
  name: z.string().min( 1 ),
  description: z.string().optional(),
  instructions: z.string().min( 1 )
} ).strict();

const generateTextArgsSchema = z.object( {
  prompt: z.string().min( 1 ),
  variables: z.any().optional(),
  promptDir: z.string().min( 1 ).optional(),
  skills: z.union( [ z.array( skillArgSchema ), z.function() ] ).optional(),
  maxSteps: z.number().int().positive().optional()
} );

function validateSchema( schema, input, errorPrefix ) {
  const result = schema.safeParse( input );
  if ( !result.success ) {
    throw new ValidationError( `${errorPrefix}: ${z.prettifyError( result.error )}` );
  }
}

export function validateGenerateTextArgs( args ) {
  validateSchema( generateTextArgsSchema, args, 'Invalid generateText() arguments' );
}

export function validateStreamTextArgs( args ) {
  validateSchema( generateTextArgsSchema, args, 'Invalid streamText() arguments' );
}
