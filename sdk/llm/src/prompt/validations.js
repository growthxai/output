import { Logger, ValidationError, z } from '@outputai/core';
import { attributesSchema } from './block_options.js';

const toolConfigSchema = z.record( z.string(), z.unknown() );
const toolsConfigSchema = z.record( z.string(), toolConfigSchema );

const toSkillPaths = value => {
  if ( value === undefined || value === null ) {
    return [];
  }
  if ( Array.isArray( value ) ) {
    return value;
  }
  return [ value ];
};

// A provider-namespaced options object, e.g. { anthropic: { cacheControl: { type: 'ephemeral' } } }
const providerOptionsSchema = z.record( z.string(), z.record( z.string(), z.unknown() ) );

export const promptSchema = z.object( {
  name: z.string(),
  config: z.object( {
    aspectRatio: z.string().regex( /^\d+:\d+$/ ).optional(),
    maxImagesPerCall: z.number().int().positive().optional(),
    maxSteps: z.number().int().positive().default( 10 ),
    maxTokens: z.number().optional(),
    messageOptions: z.record( z.string(), providerOptionsSchema ).optional(),
    model: z.string(),
    n: z.number().int().positive().optional(),
    provider: z.string().min( 1 ),
    providerOptions: z.object( {
      thinking: z.object( {
        type: z.enum( [ 'enabled', 'disabled' ] ),
        budgetTokens: z.number().optional()
      } ).loose().optional()
    } ).loose().optional(),
    seed: z.number().int().optional(),
    size: z.string().regex( /^\d+x\d+$/ ).optional(),
    skills: z.preprocess( toSkillPaths, z.array( z.string().min( 1 ) ) ),
    temperature: z.number().optional(),
    tools: toolsConfigSchema.optional()
  } ).loose(),
  messages: z.array(
    z.object( {
      role: z.string(),
      content: z.string(),
      attributes: attributesSchema.optional()
    } ).strict()
  ),
  instructions: z.string().trim().min( 1 ).nullable().optional(),
  fileDir: z.string(),
  variables: z.record( z.string(), z.union( [ z.string(), z.number(), z.boolean() ] ) ).default( {} )
} ).strict().superRefine( ( prompt, ctx ) => {
  const hasMessages = prompt.messages.length > 0;
  const hasInstructions = !!prompt.instructions;
  if ( !hasMessages && !hasInstructions ) {
    ctx.addIssue( {
      code: 'custom',
      path: [ 'messages', 'instructions' ],
      message: 'Prompt must include either message blocks or plain instructions.'
    } );
  }
  if ( hasMessages && hasInstructions ) {
    ctx.addIssue( {
      code: 'custom',
      path: [ 'messages', 'instructions' ],
      message: 'Prompt cannot include both message blocks and plain instructions.'
    } );
  }
} );

const SNAKE_CASE_WARNINGS = {
  aspect_ratio: 'aspectRatio',
  budget_tokens: 'budgetTokens',
  max_images_per_call: 'maxImagesPerCall',
  max_steps: 'maxSteps',
  max_tokens: 'maxTokens',
  options: 'providerOptions',
  stop_sequences: 'stopSequences',
  top_k: 'topK',
  top_p: 'topP'
};

function warnSnakeCaseFields( config ) {
  for ( const [ snake, camel ] of Object.entries( SNAKE_CASE_WARNINGS ) ) {
    if ( Object.hasOwn( config, snake ) ) {
      Logger.warn( `[output-llm] "${snake}" found in prompt config. Did you mean "${camel}"?`, { namespace: 'LLM' } );
    }
  }
  const thinking = config.providerOptions?.thinking;
  if ( thinking && Object.hasOwn( thinking, 'budget_tokens' ) ) {
    Logger.warn( '[output-llm] "budget_tokens" found in providerOptions.thinking. Did you mean "budgetTokens"?', { namespace: 'LLM' } );
  }
}

export function parsePromptSchema( prompt ) {
  const result = promptSchema.safeParse( prompt );
  if ( !result.success ) {
    const promptIdentifier = prompt?.name ? `"${prompt.name}"` : '(unnamed)';
    const errorMessage = z.prettifyError( result.error );

    throw new ValidationError(
      `Invalid prompt file ${promptIdentifier}: ${errorMessage}`,
      { cause: result.error }
    );
  }

  warnSnakeCaseFields( result.data.config );
  return result.data;
}
