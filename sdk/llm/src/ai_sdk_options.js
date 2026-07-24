import { loadImageModel, loadTextModel, loadTools } from './ai_model.js';
import { resolveMessageProviderOptions } from './prompt/block_options.js';
import { ROLE, isRole } from './utils/message.js';
import { resolveModelMaxOutputTokens } from './cost/fetch_models_pricing.js';
import { FatalError, Logger } from '@outputai/core';

const logger = Logger.createLogger( 'LLM' );

// Warn at most once per model to avoid log spam in hot generation loops.
const warnedUnknownModels = new Set();

// Upper bound on the max output ceiling we inject. models.dev ceilings can be very large
// (e.g. 64000); a provider already recognizes such models and picks a sane default, so we
// only need to lift the low unknown-model fallback (often 4096). Capping keeps us from
// pushing a provider-recognized model above a size that is unsafe for non-streaming calls.
const MAX_OUTPUT_TOKENS_CAP = 32000;

/**
 * When a prompt does not set `maxTokens`, default the AI SDK's `maxOutputTokens` to the
 * model's ceiling from models.dev, capped at MAX_OUTPUT_TOKENS_CAP. Without this, models
 * the provider does not recognize fall back to its low default (often 4096) and silently
 * truncate output. Only a limit models.dev actually knows is injected; genuinely unknown
 * models are left to the provider (a warning is emitted), and a cold/stale table injects
 * nothing (a background refresh is in flight).
 *
 * @param {object} options - AI SDK options being assembled (mutated in place)
 * @param {object} config - Loaded prompt config ({ provider, model })
 */
const applyModelMaxOutputDefault = ( options, config ) => {
  const { provider, model } = config;
  const { status, maxOutputTokens } = resolveModelMaxOutputTokens( { provider, model } );

  if ( status === 'known' ) {
    options.maxOutputTokens = Math.min( maxOutputTokens, MAX_OUTPUT_TOKENS_CAP );
    return;
  }

  // status 'cold': the models.dev table is not warmed yet, so we cannot know the limit for
  // this call; a background refresh is already in flight. Skip the warning to avoid a
  // false positive on a known model whose limit simply is not cached yet.
  if ( status === 'unknown' ) {
    const modelKey = `${provider}/${model}`;
    if ( !warnedUnknownModels.has( modelKey ) ) {
      warnedUnknownModels.add( modelKey );
      logger.warn(
        `No max output token limit known for model "${modelKey}"; the provider may cap output ` +
        'at a low default (often 4096). Set "maxTokens" in the prompt to control output length.'
      );
    }
  }
};

/**
 * Convert a loaded prompt into AI SDK text generation options.
 *
 * System blocks are routed to the `system` option (as `SystemModelMessage[]`, so
 * per-message providerOptions like `cacheControl` are preserved) rather than left
 * in `messages` — the AI SDK flags system roles inside `messages` as a prompt
 * injection risk, and `system` is the provider-recommended slot.
 *
 * @param {object} prompt - Loaded prompt object
 * @returns {object} Options for AI SDK text calls
 */
export const loadAiSdkTextOptions = prompt => {
  if ( prompt.messages.length === 0 ) {
    throw new FatalError( `Prompt "${prompt.name}" has no chat-style messages. Add role-tagged blocks like <system> or <user>.` );
  }
  const isSystem = isRole( ROLE.SYSTEM );
  const resolvedMessages = resolveMessageProviderOptions( prompt );

  const options = {
    model: loadTextModel( prompt ),
    system: resolvedMessages.filter( isSystem ),
    messages: resolvedMessages.filter( message => !isSystem( message ) ),
    providerOptions: prompt.config.providerOptions
  };

  if ( Number.isFinite( prompt.config.temperature ) ) {
    options.temperature = prompt.config.temperature;
  }

  if ( prompt.config.maxTokens ) {
    options.maxOutputTokens = prompt.config.maxTokens;
  } else {
    applyModelMaxOutputDefault( options, prompt.config );
  }

  const tools = loadTools( prompt );
  if ( tools ) {
    options.tools = tools;
  }

  return options;
};

/**
 * Convert a loaded prompt into AI SDK image generation options.
 *
 * @param {object} prompt - Loaded prompt object
 * @returns {object} Options for AI SDK image calls
 */
export const loadAiSdkImageOptions = ( { prompt, images, mask } ) => {
  if ( !prompt.instructions ) {
    throw new FatalError( `Prompt "${prompt.name}" has no instructions. Image prompts must use plain instructions.` );
  }
  const options = {
    model: loadImageModel( prompt ),
    prompt: ( images || mask ) ? {
      text: prompt.instructions,
      ...( images && { images } ),
      ...( mask && { mask } )
    } : prompt.instructions,
    providerOptions: prompt.config.providerOptions
  };
  for ( const key of [ 'n', 'maxImagesPerCall', 'size', 'aspectRatio', 'seed' ] ) {
    if ( prompt.config[key] !== undefined ) {
      options[key] = prompt.config[key];
    }
  }
  return options;
};
