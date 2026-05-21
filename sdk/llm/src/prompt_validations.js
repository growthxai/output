import { ValidationError, z } from '@outputai/core';

const messageContentPartSchema = z.object( {
  type: z.literal( 'text' ),
  text: z.string(),
  providerOptions: z.record( z.string(), z.unknown() ).optional()
} ).strict();

const messageSchema = z.object( {
  role: z.string(),
  content: z.union( [
    z.string(),
    z.array( messageContentPartSchema ).min( 1 )
  ] ),
  providerOptions: z.record( z.string(), z.unknown() ).optional()
} ).strict();

export const promptSchema = z.object( {
  name: z.string(),
  config: z.object( {
    provider: z.string().min( 1 ),
    model: z.string(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
    tools: z.record( z.string(), z.object( {} ).passthrough() ).optional(),
    providerOptions: z.object( {
      thinking: z.object( {
        type: z.enum( [ 'enabled', 'disabled' ] ),
        budgetTokens: z.number().optional()
      } ).passthrough().optional()
    } ).passthrough().optional()
  } ).passthrough(),
  messages: z.array( messageSchema )
} ).strict();

const SNAKE_CASE_WARNINGS = {
  max_tokens: 'maxTokens',
  budget_tokens: 'budgetTokens',
  top_p: 'topP',
  top_k: 'topK',
  stop_sequences: 'stopSequences',
  options: 'providerOptions'
};

function warnSnakeCaseFields( config ) {
  for ( const [ snake, camel ] of Object.entries( SNAKE_CASE_WARNINGS ) ) {
    if ( Object.hasOwn( config, snake ) ) {
      console.warn( `[output-llm] "${snake}" found in prompt config. Did you mean "${camel}"?` );
    }
  }
  const thinking = config.providerOptions?.thinking;
  if ( thinking && Object.hasOwn( thinking, 'budget_tokens' ) ) {
    console.warn( '[output-llm] "budget_tokens" found in providerOptions.thinking. Did you mean "budgetTokens"?' );
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
