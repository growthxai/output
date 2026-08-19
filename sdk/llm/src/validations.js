import { Buffer } from 'node:buffer';
import { ValidationError, z } from '@outputai/core';

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

const variablesSchema = z.record( z.string(), z.union( [ z.string(), z.number(), z.boolean() ] ) );

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

const plainObjectSchema = z.object( {} ).loose();

const outputSchema = plainObjectSchema;

const toolsSchema = z.record( z.string().min( 1 ), plainObjectSchema );

const conversationStoreSchema = z.object( {
  getMessages: functionSchema,
  addMessages: functionSchema
} ).loose();

const modelMessageSchema = z.object( {
  role: z.enum( [ 'system', 'user', 'assistant', 'tool' ] ),
  content: z.union( [ z.string(), z.array( z.unknown() ) ] )
} ).loose();

const promptFileCallFields = {
  prompt: z.string().min( 1 ),
  promptDir: z.string().min( 1 ).optional(),
  variables: variablesSchema.optional(),
  ...promptOwnedCallArgRejection
};

const textRuntimeCallFields = {
  abortSignal: z.instanceof( AbortSignal ).optional(),
  output: outputSchema.optional(),
  stopWhen: stopWhenSchema.optional(),
  toolChoice: toolChoiceSchema.optional(),
  tools: toolsSchema.optional()
};

const generateTextCallFields = {
  ...promptFileCallFields,
  ...textRuntimeCallFields
};

const toPromptFileArgs = ( { prompt, maxSteps, skills, ...rest } ) => ( {
  promptFile: prompt,
  ...rest
} );

const generateTextArgsSchema = z.object( generateTextCallFields ).strict().transform( toPromptFileArgs );

const generateTextWithStreamingArgsSchema = z.object( {
  ...generateTextCallFields,
  onChunk: functionSchema.optional()
} ).strict().transform( toPromptFileArgs );

const streamTextArgsSchema = z.object( {
  ...generateTextCallFields,
  onChunk: functionSchema.optional(),
  onError: functionSchema.optional(),
  onFinish: functionSchema.optional()
} ).strict().transform( toPromptFileArgs );

const agentCallFields = {
  ...promptFileCallFields,
  conversationStore: conversationStoreSchema.optional(),
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

const agentArgsSchema = z.object( agentCallFields ).strict().transform( toPromptFileArgs );

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
  ...promptFileCallFields
};

const generateImageArgsSchema = z.object( generateImageCallFields ).strict().superRefine( ( args, ctx ) => {
  if ( args.mask && !args.images ) {
    ctx.addIssue( {
      code: 'custom',
      path: [ 'mask' ],
      message: 'mask requires images.'
    } );
  }
} ).transform( toPromptFileArgs );

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
