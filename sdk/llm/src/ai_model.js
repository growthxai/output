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

const toolConfigSchema = z.record( z.string(), z.unknown() );

export function registerProvider( name, providerFn ) {
  const result = registerProviderSchema.safeParse( { name, providerFn } );
  if ( !result.success ) {
    throw new ValidationError( `Invalid provider registration: ${z.prettifyError( result.error )}` );
  }
  providers[name] = providerFn;
}

export const getRegisteredProviders = () => Object.keys( providers );

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
    const availableProviders = Object.keys( providers ).join( ', ' );
    throw new Error( `Invalid provider "${providerName}". Valid providers: ${availableProviders}` );
  }

  return provider( modelName );
}

export function loadTools( prompt ) {
  const config = prompt?.config;

  if ( !config ) {
    throw new Error( 'Prompt is missing config object' );
  }

  const { tools: toolsConfig, provider: providerName } = config;

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
