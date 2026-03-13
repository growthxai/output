import { ValidationError, z } from '@outputai/core';

const generateTextArgsSchema = z.object( {
  prompt: z.string(),
  variables: z.any().optional()
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
