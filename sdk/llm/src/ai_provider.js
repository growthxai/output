import { FatalError, ValidationError, z } from '@outputai/core';
import { EnvHttpProxyAgent, fetch } from 'undici';
// providers
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createOpenAI } from '@ai-sdk/openai';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createVertex } from '@ai-sdk/google-vertex';

/** This custom dispatcher has longer timeouts. */
const customDispatcher = new EnvHttpProxyAgent( {
  headersTimeout: 15 * 60 * 1000, // 15 min
  bodyTimeout: 15 * 60 * 1000,
  allowH2: false // Ignore HTTP/2. Check OUT-505
} );

/** This custom fetch instance uses the custom dispatcher */
const customFetch = ( input, init ) => fetch( input, { dispatcher: customDispatcher, ...init } );

/** Available provider to initialize. */
const providerInitializers = {
  anthropic: createAnthropic,
  azure: createAzure,
  bedrock: createAmazonBedrock,
  openai: createOpenAI,
  perplexity: createPerplexity,
  vertex: createVertex
};

/** Providers already initialized due usage */
const initializedProviders = {};

/** Providers registered by the user */
const registeredProviders = {};

/**
 * Get all available provider names, including shipped and registered.
 * @returns {string[]} Provider names
 */
export const getProviderNames = () =>
  new Set( Object.keys( providerInitializers ).concat( Object.keys( registeredProviders ) ) ).values().toArray();

const registerProviderSchema = z.object( {
  name: z.string().min( 1, 'Provider name must be a non-empty string' ),
  providerFn: z.function()
} );

/**
 * Register or override an AI SDK provider factory by name.
 * @param {string} name - Provider name used in prompt frontmatter
 * @param {Function} providerFn - Factory function that receives a model id
 * @returns {void}
 */
export function registerProvider( name, providerFn ) {
  const result = registerProviderSchema.safeParse( { name, providerFn } );
  if ( !result.success ) {
    throw new ValidationError( `Invalid provider registration: ${z.prettifyError( result.error )}` );
  }
  registeredProviders[name] = providerFn;
}

/**
 * Return a provider by its name.
 * Look for registered providers first.
 * If none, looks for initialized providers.
 * Finally, looks for available provider initializers, and if found, init it.
 *
 * @param {string} name
 * @returns {object} provider
 */
export const getProvider = name => {
  const provider = registeredProviders[name] ?? initializedProviders[name];

  if ( provider ) {
    return provider;
  }
  if ( providerInitializers[name] ) {
    try {
      return initializedProviders[name] = providerInitializers[name]( { fetch: customFetch } );
    } catch ( error ) {
      throw new FatalError( `Failed to initialize provider "${name}": ${error.message}`, { cause: error } );
    }
  }

  throw new FatalError( `Unsupported provider "${name}"` );
};
