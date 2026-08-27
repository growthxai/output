import { ValidationError, z } from '@outputai/core';

const objectMapSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.unknown()
  )
);

const promptConfigSchema = z.object( {
  aspectRatio: z.string().regex( /^\d+:\d+$/ ).optional(),
  frequencyPenalty: z.number().optional(),
  maxImagesPerCall: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxSteps: z.number().int().positive().default( 10 ),
  maxTokens: z.number().int().positive().optional(),
  // A provider-namespaced options object, e.g. { anthropic: { cacheControl: { type: 'ephemeral' } } }
  messageOptions: z.record( z.string(), objectMapSchema ).optional(),
  model: z.string().min( 1 ),
  n: z.number().int().positive().optional(),
  presencePenalty: z.number().optional(),
  provider: z.string().min( 1 ),
  providerOptions: z.object( {
    thinking: z.object( {
      type: z.enum( [ 'enabled', 'disabled' ] ),
      budgetTokens: z.number().optional()
    } ).loose().optional()
  } ).loose().optional(),
  seed: z.number().int().optional(),
  size: z.string().regex( /^\d+x\d+$/ ).optional(),
  skills: z.preprocess( v => Array.isArray( v ) ? v : [].concat( v ?? [] ), z.array( z.string().min( 1 ) ) ),
  stopSequences: z.array( z.string() ).optional(),
  temperature: z.number().optional(),
  topK: z.number().optional(),
  topP: z.number().optional(),
  tools: objectMapSchema.optional()
} ).strict();

export const promptSchema = z.object( {
  name: z.string(),
  config: promptConfigSchema,
  messages: z.array(
    z.object( {
      role: z.string(),
      content: z.string(),
      providerOptions: objectMapSchema.optional()
    } ).strict()
  ),
  instructions: z.string().trim().min( 1 ).nullable().default( null ),
  fileDir: z.string(),
  variables: z.record( z.string(), z.unknown() ).default( {} )
} ).strict().superRefine( ( prompt, ctx ) => {
  const hasMessages = prompt.messages.length > 0;
  const hasInstructions = !!prompt.instructions;
  const addIssue = message => ctx.addIssue( { code: 'custom', path: [ 'messages', 'instructions' ], message } );

  if ( !hasMessages && !hasInstructions ) {
    addIssue( 'Prompt must include either message blocks or plain instructions.' );
  } else if ( hasMessages && hasInstructions ) {
    addIssue( 'Prompt cannot include both message blocks and plain instructions.' );
  }
} );

const promptConfigKeys = new Set( Object.keys( promptConfigSchema.shape ) );

/** Converts a string to camel case */
const toCamelCase = value => value.replace( /_([a-z])/g, ( _, letter ) => letter.toUpperCase() );

/** Appends camelCase suggestions to unrecognized top-level config keys written in snake_case. */
const appendCamelCaseSuggestions = error => {
  for ( const issue of error.issues ) {
    if ( issue.code !== 'unrecognized_keys' || issue.path.length !== 1 || issue.path[0] !== 'config' ) {
      continue;
    }

    const suggestions = issue.keys
      .filter( key => key.includes( '_' ) )
      .map( key => ( { key, camel: toCamelCase( key ) } ) )
      .filter( ( { key, camel } ) => camel !== key && promptConfigKeys.has( camel ) )
      .map( ( { key, camel } ) => `"${key}" is not valid; use "${camel}"` );

    if ( suggestions.length > 0 ) {
      issue.message = `${issue.message}. ${suggestions.join( '. ' )}`;
    }
  }
};

export const parsePromptSchema = prompt => {
  const result = promptSchema.safeParse( prompt );
  if ( !result.success ) {
    appendCamelCaseSuggestions( result.error );

    throw new ValidationError(
      `Invalid prompt file ${prompt.name}: ${z.prettifyError( result.error )}`,
      { cause: result.error }
    );
  }
  return result.data;
};
