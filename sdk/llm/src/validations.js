import { Buffer } from 'node:buffer';
import { ValidationError, z } from '@outputai/core';
import { promptSchema } from './prompt/validations.js';

const rejectPromptOwnedCallArg = name => z.unknown().optional().refine(
  value => value === undefined,
  `${name} must be set in the prompt file, not as a call argument`
);

// Listed so .strict() callers get the prompt-file message instead of an unrecognized-key error.
// @TODO Do not drop this later.
const promptOwnedCallArgRejection = {
  maxSteps: rejectPromptOwnedCallArg( 'maxSteps' ),
  skills: rejectPromptOwnedCallArg( 'skills' )
};

const functionSchema = z.custom( value => typeof value === 'function', 'Expected function' );

const variablesSchema = z.record( z.string(), z.unknown() );

const toolChoiceSchema = z.union( [
  z.enum( [ 'auto', 'none', 'required' ] ),
  z.object( {
    type: z.literal( 'tool' ),
    toolName: z.string().min( 1 )
  } ).strict()
] );

const stopWhenSchema = z.union( [
  functionSchema,
  z.array( functionSchema ).min( 1 )
] );

const opaqueObjectSchema = z.custom(
  value => value !== null && typeof value === 'object' && !Array.isArray( value ),
  'Expected object'
);

const outputSchema = opaqueObjectSchema;

const toolsSchema = z.record( z.string().min( 1 ), opaqueObjectSchema );

const messageStoreSchema = z.custom(
  value => value !== null &&
    typeof value === 'object' &&
    typeof value.getMessages === 'function' &&
    typeof value.addMessages === 'function',
  'Expected an object with getMessages and addMessages functions'
);

const modelMessageSchema = z.object( {
  role: z.enum( [ 'system', 'user', 'assistant', 'tool' ] ),
  content: z.union( [ z.string(), z.array( z.unknown() ) ] )
} ).loose();

const promptFileSchema = z.string().min( 1 );

const promptInputSchema = z.unknown().transform( ( value, ctx ) => {
  const result = ( typeof value === 'string' ? promptFileSchema : promptSchema ).safeParse( value );
  if ( !result.success ) {
    for ( const issue of result.error.issues ) {
      ctx.addIssue( issue );
    }
    return value;
  }
  return result.data;
} );

const promptFileCallFields = {
  prompt: promptFileSchema,
  promptDir: z.string().min( 1 ).optional(),
  variables: variablesSchema.optional()
};

const promptCallFields = {
  ...promptFileCallFields,
  prompt: promptInputSchema
};

const textRuntimeCallFields = {
  abortSignal: z.instanceof( AbortSignal ).optional(),
  output: outputSchema.optional(),
  stopWhen: stopWhenSchema.optional(),
  toolChoice: toolChoiceSchema.optional(),
  tools: toolsSchema.optional()
};

const generateTextCallFields = {
  ...promptCallFields,
  ...promptOwnedCallArgRejection,
  ...textRuntimeCallFields
};

const toPromptArgs = ( { prompt, maxSteps, skills, ...rest } ) => ( {
  ...( typeof prompt === 'string' ? { promptFile: prompt } : { promptObject: prompt } ),
  ...rest
} );

const rejectPromptObjectFileArgs = ( args, ctx ) => {
  if ( typeof args.prompt === 'string' ) {
    return;
  }

  for ( const field of [ 'promptDir', 'variables' ] ) {
    if ( args[field] !== undefined ) {
      ctx.addIssue( {
        code: 'custom',
        path: [ field ],
        message: `${field} cannot be used when prompt is an object`
      } );
    }
  }
};

const generateTextArgsSchema = z.object( generateTextCallFields )
  .strict()
  .superRefine( rejectPromptObjectFileArgs )
  .transform( toPromptArgs );

const generateTextWithStreamingArgsSchema = z.object( {
  ...generateTextCallFields,
  onChunk: functionSchema.optional()
} ).strict().superRefine( rejectPromptObjectFileArgs ).transform( toPromptArgs );

const streamTextArgsSchema = z.object( {
  ...generateTextCallFields,
  onChunk: functionSchema.optional(),
  onError: functionSchema.optional(),
  onFinish: functionSchema.optional()
} ).strict().superRefine( rejectPromptObjectFileArgs ).transform( toPromptArgs );

const agentCallFields = {
  ...promptCallFields,
  ...promptOwnedCallArgRejection,
  messageStore: messageStoreSchema.optional(),
  output: outputSchema.optional(),
  stopWhen: stopWhenSchema.optional(),
  tools: toolsSchema.optional()
};

const agentMethodCallFields = {
  abortSignal: z.instanceof( AbortSignal ).optional(),
  messages: z.array( modelMessageSchema ).default( [] ),
  toolChoice: toolChoiceSchema.optional(),
  ...promptOwnedCallArgRejection
};

const agentArgsSchema = z.object( agentCallFields )
  .strict()
  .superRefine( rejectPromptObjectFileArgs )
  .transform( toPromptArgs );

const agentGenerateArgsSchema = z.object( agentMethodCallFields ).strict();

const agentGenerateWithStreamingArgsSchema = z.object( {
  ...agentMethodCallFields,
  onChunk: functionSchema.optional()
} ).strict();

const agentStreamArgsSchema = z.object( {
  ...agentMethodCallFields,
  onChunk: functionSchema.optional(),
  onError: functionSchema.optional(),
  onFinish: functionSchema.optional()
} ).strict();

const base64StringSchema = z.string()
  .min( 1 )
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/,
    'Image strings must be raw base64 data.'
  );

const imageDataSchema = z.union( [
  z.instanceof( Buffer ),
  z.instanceof( Uint8Array ),
  z.instanceof( ArrayBuffer ),
  base64StringSchema
] );

const imageInputSchema = z.union( [
  imageDataSchema,
  z.object( {
    data: imageDataSchema,
    mediaType: z.string().min( 1 ).optional()
  } ).strict()
] );

const generateImageCallFields = {
  abortSignal: z.instanceof( AbortSignal ).optional(),
  images: z.array( imageInputSchema ).min( 1 ).optional(),
  mask: imageInputSchema.optional(),
  ...promptCallFields
};

const generateImageArgsSchema = z.object( generateImageCallFields ).strict().superRefine( ( args, ctx ) => {
  rejectPromptObjectFileArgs( args, ctx );

  if ( args.mask && !args.images ) {
    ctx.addIssue( {
      code: 'custom',
      path: [ 'mask' ],
      message: 'mask requires images.'
    } );
  }
} ).transform( toPromptArgs );

const parseSchema = ( schema, input, errorPrefix ) => {
  const result = schema.safeParse( input );
  if ( !result.success ) {
    throw new ValidationError( `${errorPrefix}: ${z.prettifyError( result.error )}` );
  }
  return result.data;
};

export const parseGenerateTextArgs = args =>
  parseSchema( generateTextArgsSchema, args, 'Invalid generateText() arguments' );

export const parseGenerateTextWithStreamingArgs = args =>
  parseSchema( generateTextWithStreamingArgsSchema, args, 'Invalid generateTextWithStreaming() arguments' );

export const parseStreamTextArgs = args =>
  parseSchema( streamTextArgsSchema, args, 'Invalid streamText() arguments' );

export const parseGenerateImageArgs = args =>
  parseSchema( generateImageArgsSchema, args, 'Invalid generateImage() arguments' );

export const parseAgentArgs = args =>
  parseSchema( agentArgsSchema, args, 'Invalid Agent() arguments' );

export const parseAgentGenerateArgs = args =>
  parseSchema( agentGenerateArgsSchema, args ?? {}, 'Invalid Agent.generate() arguments' );

export const parseAgentGenerateWithStreamingArgs = args =>
  parseSchema( agentGenerateWithStreamingArgsSchema, args ?? {}, 'Invalid Agent.generateWithStreaming() arguments' );

export const parseAgentStreamArgs = args =>
  parseSchema( agentStreamArgsSchema, args ?? {}, 'Invalid Agent.stream() arguments' );
