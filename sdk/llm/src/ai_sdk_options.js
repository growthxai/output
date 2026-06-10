import { loadImageModel, loadTextModel, loadTools } from './ai_model.js';
import { FatalError } from '@outputai/core';

/**
 * Resolve the provider-options namespace for the `cache` shorthand. Anthropic prompt caching is
 * expressed under the `anthropic` namespace, including Claude models served through Vertex.
 */
const cacheNamespace = ( { provider, model } ) => {
  if ( provider === 'anthropic' ) {
    return 'anthropic';
  }
  if ( provider === 'vertex' && /claude/i.test( model ) ) {
    return 'anthropic';
  }
  return null;
};

/** Shallow-merge two provider-options objects, combining keys within each provider namespace. */
const mergeProviderOptions = ( base = {}, extra = {} ) => {
  const merged = { ...base };
  for ( const [ namespace, options ] of Object.entries( extra ) ) {
    merged[namespace] = { ...merged[namespace], ...options };
  }
  return merged;
};

/** Expand the `cache` shorthand into a provider-namespaced `cacheControl` options object. */
const cacheShorthandOptions = ( cache, config, promptName ) => {
  const namespace = cacheNamespace( config );
  if ( !namespace ) {
    console.warn(
      `[output-llm] Prompt "${promptName}": "cache" shorthand only supports Anthropic models; ` +
      `ignoring for provider "${config.provider}". Use messageOptions to cache on other providers.`
    );
    return {};
  }
  const cacheControl = { type: 'ephemeral', ...( typeof cache === 'string' && { ttl: cache } ) };
  return { [namespace]: { cacheControl } };
};

/**
 * Resolve per-message provider options from `messageOptions` set references and the `cache`
 * shorthand into AI SDK per-message `providerOptions`, returning clean messages with the
 * `cache`/`options` authoring helpers stripped.
 */
const resolveMessageProviderOptions = ( { name, config, messages } ) => {
  const sets = config.messageOptions ?? {};

  return messages.map( ( { cache, options, providerOptions, ...message } ) => {
    const fromSets = ( options ?? [] ).reduce( ( acc, setName ) => {
      if ( !sets[setName] ) {
        throw new FatalError( `Prompt "${name}" references unknown messageOptions set "${setName}"` );
      }
      return mergeProviderOptions( acc, sets[setName] );
    }, providerOptions ?? {} );

    const resolved = cache ?
      mergeProviderOptions( fromSets, cacheShorthandOptions( cache, config, name ) ) :
      fromSets;

    return Object.keys( resolved ).length > 0 ? { ...message, providerOptions: resolved } : message;
  } );
};

/**
 * Convert a loaded prompt into AI SDK text generation options.
 *
 * @param {object} prompt - Loaded prompt object
 * @returns {object} Options for AI SDK text calls
 */
export const loadAiSdkTextOptions = prompt => {
  if ( prompt.messages.length === 0 ) {
    throw new FatalError( `Prompt "${prompt.name}" has no chat-style messages. Add role-tagged blocks like <system> or <user>.` );
  }
  const options = {
    model: loadTextModel( prompt ),
    messages: resolveMessageProviderOptions( prompt ),
    providerOptions: prompt.config.providerOptions
  };

  if ( Number.isFinite( prompt.config.temperature ) ) {
    options.temperature = prompt.config.temperature;
  }

  if ( prompt.config.maxTokens ) {
    options.maxOutputTokens = prompt.config.maxTokens;
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
