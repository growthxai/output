import { bedrock } from '@ai-sdk/amazon-bedrock';
import { anthropic } from '@ai-sdk/anthropic';
import { azure } from '@ai-sdk/azure';
import { vertex } from '@ai-sdk/google-vertex';
import { openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import { ValidationError, z } from '@outputai/core';

export const builtInProviders = { azure, anthropic, openai, vertex, bedrock, perplexity };
export const providers = { ...builtInProviders };

const registerProviderSchema = z.object( {
  name: z.string().min( 1, 'Provider name must be a non-empty string' ),
  providerFn: z.function()
} );

export function registerProvider( name, providerFn ) {
  const result = registerProviderSchema.safeParse( { name, providerFn } );
  if ( !result.success ) {
    throw new ValidationError(
      `Invalid provider registration: ${z.prettifyError( result.error )}`,
      { cause: result.error }
    );
  }
  providers[name] = providerFn;
}

export function getRegisteredProviders() {
  return Object.keys( providers );
}

export function loadModel( prompt ) {
  const config = prompt?.config;

  if ( !config ) {
    throw new Error( 'Prompt is missing config object' );
  }

  const { provider: providerName, model: modelName } = config;

  if ( !providerName ) {
    throw new Error( 'Prompt config is missing "provider" field' );
  }

  if ( !modelName ) {
    throw new Error( 'Prompt config is missing "model" field' );
  }

  const provider = providers[providerName];

  if ( !provider ) {
    const validProviders = Object.keys( providers ).join( ', ' );
    throw new Error(
      `Invalid provider "${providerName}". Valid providers: ${validProviders}`
    );
  }

  return provider( modelName );
}

export function loadTools( prompt ) {
  const config = prompt?.config;
  const toolsConfig = config?.tools;

  if ( !toolsConfig ) {
    return null;
  }

  if ( Array.isArray( toolsConfig ) ) {
    throw new Error(
      'tools must be an object with tool configurations, got array. ' +
      'Use "tools: { googleSearch: {} }" not "tools: [googleSearch]"'
    );
  }

  if ( typeof toolsConfig !== 'object' ) {
    throw new Error(
      `tools must be an object, got ${typeof toolsConfig}. ` +
      'Use "tools: { googleSearch: {} }"'
    );
  }

  if ( Object.keys( toolsConfig ).length === 0 ) {
    return null;
  }

  const providerName = config.provider;
  const provider = providers[providerName];

  if ( !provider ) {
    const validProviders = Object.keys( providers ).join( ', ' );
    throw new Error(
      `Invalid provider "${providerName}". Valid providers: ${validProviders}`
    );
  }

  if ( !provider.tools || typeof provider.tools !== 'object' ) {
    throw new Error(
      `Provider "${providerName}" does not support provider-specific tools.`
    );
  }

  const tools = {};

  for ( const [ toolName, toolConfig ] of Object.entries( toolsConfig ) ) {
    const toolFactory = provider.tools[toolName];

    if ( !toolFactory || typeof toolFactory !== 'function' ) {
      const availableTools = Object.keys( provider.tools )
        .filter( key => typeof provider.tools[key] === 'function' )
        .join( ', ' );

      throw new Error(
        `Unknown tool "${toolName}" for provider "${providerName}".` +
        ( availableTools ? ` Available tools: ${availableTools}` : '' )
      );
    }

    if ( typeof toolConfig !== 'object' || toolConfig === null ) {
      throw new Error(
        `Configuration for tool "${toolName}" must be an object. ` +
        `Use "${toolName}: {}" for tools without configuration.`
      );
    }

    tools[toolName] = toolFactory( toolConfig );
  }

  return tools;
}
