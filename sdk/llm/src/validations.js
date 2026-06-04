import { Buffer } from 'node:buffer';
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

const imageDataSchema = z.union( [
  z.instanceof( Buffer ),
  z.instanceof( Uint8Array ),
  z.instanceof( ArrayBuffer ),
  z.string().min( 1 )
] );

const imageInputSchema = z.union( [
  imageDataSchema,
  z.object( {
    data: imageDataSchema,
    mediaType: z.string().min( 1 ).optional()
  } ).strict()
] );

const generateImageArgsSchema = z.object( {
  prompt: z.string().min( 1 ),
  variables: z.any().optional(),
  promptDir: z.string().min( 1 ).optional(),
  images: z.array( imageInputSchema ).min( 1 ).optional(),
  mask: imageInputSchema.optional()
} ).superRefine( ( args, ctx ) => {
  if ( args.mask && !args.images ) {
    ctx.addIssue( {
      code: 'custom',
      path: [ 'mask' ],
      message: 'mask requires images.'
    } );
  }
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

export function validateGenerateImageArgs( args ) {
  validateSchema( generateImageArgsSchema, args, 'Invalid generateImage() arguments' );
}
