import { ValidationError, z } from '@outputai/core';
import { createLogger } from '@outputai/core/logger';
import { attributesSchema } from './block_options.js';

const log = createLogger( 'LLM Prompt' );

const toolConfigSchema = z.record( z.string(), z.unknown() );
const toolsConfigSchema = z.record( z.string(), toolConfigSchema );

// A provider-namespaced options object, e.g. { anthropic: { cacheControl: { type: 'ephemeral' } } }
const providerOptionsSchema = z.record( z.string(), z.record( z.string(), z.unknown() ) );

export const promptSchema = z.object( {
  name: z.string(),
  config: z.object( {
    provider: z.string().min( 1 ),
    model: z.string(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
    n: z.number().int().positive().optional(),
    maxImagesPerCall: z.number().int().positive().optional(),
    size: z.string().regex( /^\d+x\d+$/ ).optional(),
    aspectRatio: z.string().regex( /^\d+:\d+$/ ).optional(),
    seed: z.number().int().optional(),
    skills: z.union( [ z.string().min( 1 ), z.array( z.string().min( 1 ) ) ] ).optional(),
    tools: toolsConfigSchema.optional(),
    providerOptions: z.object( {
      thinking: z.object( {
        type: z.enum( [ 'enabled', 'disabled' ] ),
        budgetTokens: z.number().optional()
      } ).loose().optional()
    } ).loose().optional(),
    messageOptions: z.record( z.string(), providerOptionsSchema ).optional()
  } ).loose(),
  messages: z.array(
    z.object( {
      role: z.string(),
      content: z.string(),
      attributes: attributesSchema.optional()
    } ).strict()
  ),
  instructions: z.string().trim().min( 1 ).nullable().optional()
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
  max_tokens: 'maxTokens',
  max_images_per_call: 'maxImagesPerCall',
  aspect_ratio: 'aspectRatio',
  budget_tokens: 'budgetTokens',
  top_p: 'topP',
  top_k: 'topK',
  stop_sequences: 'stopSequences',
  options: 'providerOptions'
};

function warnSnakeCaseFields( config ) {
  for ( const [ snake, camel ] of Object.entries( SNAKE_CASE_WARNINGS ) ) {
    if ( Object.hasOwn( config, snake ) ) {
      log.warn( `"${snake}" found in prompt config. Did you mean "${camel}"?` );
    }
  }
  const thinking = config.providerOptions?.thinking;
  if ( thinking && Object.hasOwn( thinking, 'budget_tokens' ) ) {
    log.warn( '"budget_tokens" found in providerOptions.thinking. Did you mean "budgetTokens"?' );
  }
}

export function validatePrompt( prompt ) {
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
}
