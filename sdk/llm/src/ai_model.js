import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import { createPerplexity } from '@ai-sdk/perplexity';
import { ValidationError, z } from '@outputai/core';
import { Agent, fetch } from 'undici';

const dispatcher = new Agent( {
  headersTimeout: 15 * 60 * 1000, // 15 min
  bodyTimeout: 15 * 60 * 1000
} );

const customFetch = ( input, init ) => fetch( input, { dispatcher, ...init } );
const initProvider = factory => factory( { fetch: customFetch } );

export const builtInProviders = {
  azure: initProvider( createAzure ),
  anthropic: initProvider( createAnthropic ),
  openai: initProvider( createOpenAI ),
  vertex: initProvider( createVertex ),
  bedrock: initProvider( createAmazonBedrock ),
  perplexity: initProvider( createPerplexity )
};

export const providers = { ...builtInProviders };

const registerProviderSchema = z.object( {
  name: z.string().min( 1, 'Provider name must be a non-empty string' ),
  providerFn: z.function()
} );

const modelPromptSchema = z.object( {
  config: z.object( {
    provider: z.string().min( 1 ),
    model: z.string().min( 1 )
  } ).loose()
} ).loose();

const toolsPromptSchema = z.object( {
  config: z.object( {
    provider: z.string().min( 1 ),
    tools: z.record( z.string(), z.record( z.string(), z.unknown() ) ).optional()
  } ).loose()
} ).loose();

const toolConfigSchema = z.record( z.string(), z.unknown() );

const parseModelPrompt = prompt => {
  const result = modelPromptSchema.safeParse( prompt );
  if ( !result.success ) {
    throw new ValidationError( `Invalid model prompt config: ${z.prettifyError( result.error )}` );
  }
  return result.data.config;
};

const parseToolsPrompt = prompt => {
  const result = toolsPromptSchema.safeParse( prompt );
  if ( !result.success ) {
    throw new ValidationError( `Invalid tools prompt config: ${z.prettifyError( result.error )}` );
  }
  return result.data.config;
};

/**
 * Register or override an AI SDK provider factory by name.
 *
 * @param {string} name - Provider name used in prompt frontmatter
 * @param {Function} providerFn - Factory function that receives a model id
 * @returns {void}
 */
export function registerProvider( name, providerFn ) {
  const result = registerProviderSchema.safeParse( { name, providerFn } );
  if ( !result.success ) {
    throw new ValidationError( `Invalid provider registration: ${z.prettifyError( result.error )}` );
  }
  providers[name] = providerFn;
}

/**
 * List all currently registered provider names.
 *
 * @returns {string[]} Provider names
 */
export const getRegisteredProviders = () => Object.keys( providers );

/**
 * Load a text model from a loaded prompt config.
 *
 * @param {object} prompt - Loaded prompt object with `config.provider` and `config.model`
 * @returns {unknown} AI SDK language model
 */
export function loadTextModel( prompt ) {
  const config = parseModelPrompt( prompt );
  const { provider: providerName, model: modelName } = config;

  const provider = providers[providerName];

  if ( !provider ) {
    const availableProviders = Object.keys( providers ).join( ', ' );
    throw new Error( `Invalid provider "${providerName}". Valid providers: ${availableProviders}` );
  }

  return provider( modelName );
}

/**
 * Load an image model from a loaded prompt config.
 *
 * @param {object} prompt - Loaded prompt object with `config.provider` and `config.model`
 * @returns {unknown} AI SDK image model
 */
export function loadImageModel( prompt ) {
  const config = parseModelPrompt( prompt );
  const { provider: providerName, model: modelName } = config;

  const provider = providers[providerName];

  if ( !provider ) {
    const availableProviders = Object.keys( providers ).join( ', ' );
    throw new Error( `Invalid provider "${providerName}". Valid providers: ${availableProviders}` );
  }

  const imageModelFactory = provider.image ?? provider.imageModel;
  if ( typeof imageModelFactory !== 'function' ) {
    throw new Error( `Provider "${providerName}" does not support image models.` );
  }

  return imageModelFactory( modelName );
}

/**
 * Load provider-specific tools configured in a prompt.
 *
 * @param {object} prompt - Loaded prompt object with `config.provider` and optional `config.tools`
 * @returns {Record<string, unknown> | null} AI SDK tools, or null when none are configured
 */
export function loadTools( prompt ) {
  const config = parseToolsPrompt( prompt );
  const { tools: toolsConfig, provider: providerName } = config;

  if ( !toolsConfig || Object.keys( toolsConfig ).length === 0 ) {
    return null;
  }

  const provider = providers[providerName];

  if ( !provider ) {
    const availableProviders = Object.keys( providers ).join( ', ' );
    throw new Error( `Invalid provider "${providerName}". Valid providers: ${availableProviders}` );
  }

  if ( !provider.tools || typeof provider.tools !== 'object' ) {
    throw new Error( `Provider "${providerName}" does not support provider-specific tools.` );
  }

  const tools = {};

  for ( const [ toolName, toolConfig ] of Object.entries( toolsConfig ) ) {
    const toolFactory = provider.tools[toolName];

    if ( !toolFactory || typeof toolFactory !== 'function' ) {
      const availableTools = Object.keys( provider.tools )
        .filter( key => typeof provider.tools[key] === 'function' )
        .join( ', ' );
      const toolsMessage = availableTools ? `Available tools: ${availableTools}` : 'No tools are available';

      throw new Error( `Unknown tool "${toolName}" for provider "${providerName}". ${toolsMessage}` );
    }

    const result = toolConfigSchema.safeParse( toolConfig );
    if ( !result.success ) {
      throw new ValidationError( `Invalid config for tool "${toolName}": ${z.prettifyError( result.error )}` );
    }

    tools[toolName] = toolFactory( toolConfig );
  }

  return tools;
}
