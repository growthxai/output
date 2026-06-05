import { FatalError, ValidationError, z } from '@outputai/core';
import { Agent, fetch } from 'undici';
import { createRequire } from 'module';

const require = createRequire( import.meta.url );

/** This custom dispatcher has longer timeouts */
const customDispatcher = new Agent( {
  headersTimeout: 15 * 60 * 1000, // 15 min
  bodyTimeout: 15 * 60 * 1000
} );

/** This custom fetch instance uses the custom dispatcher */
const customFetch = ( input, init ) => fetch( input, { dispatcher: customDispatcher, ...init } );

/** Providers loaded during usage */
const loadedProviders = {};

/** Available provider to lazy load. Imports need to be strings for bundlers to see them */
const shippedProviders = {
  anthropic: { loader: () => require( '@ai-sdk/anthropic' ).createAnthropic, pkg: '@ai-sdk/anthropic' },
  azure: { loader: () => require( '@ai-sdk/azure' ).createAzure, pkg: '@ai-sdk/azure' },
  bedrock: { loader: () => require( '@ai-sdk/amazon-bedrock' ).createAmazonBedrock, pkg: '@ai-sdk/amazon-bedrock' },
  openai: { loader: () => require( '@ai-sdk/openai' ).createOpenAI, pkg: '@ai-sdk/openai' },
  perplexity: { loader: () => require( '@ai-sdk/perplexity' ).createPerplexity, pkg: '@ai-sdk/perplexity' },
  vertex: { loader: () => require( '@ai-sdk/google-vertex' ).createVertex, pkg: '@ai-sdk/google-vertex' }
};

/** Providers registered by the user */
const registeredProviders = {};

/**
 * Get all available provider names, including shipped and registered.
 * @returns {string[]} Provider names
 */
export const getProviderNames = () =>
  new Set( Object.keys( shippedProviders ).concat( Object.keys( registeredProviders ) ) ).values().toArray();

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
 * Dynamic load a provider
 * @param {string} name
 * @returns {object} provider
 */
const loadProvider = name => {
  const { loader, pkg } = shippedProviders[name];
  try {
    const provider = loader()( { fetch: customFetch } );
    console.debug( `LLM: Provider "${name}" loaded` );
    return provider;
  } catch ( error ) {
    if ( error.code === 'MODULE_NOT_FOUND' && error.message.startsWith( `Cannot find module '${pkg}'` ) ) {
      throw new FatalError( `Provider "${name}" requires "${pkg}". Install it to use this provider.`, { cause: error } );
    }
    if ( [ 'ERR_REQUIRE_ESM', 'ERR_REQUIRE_ASYNC_MODULE', 'ERR_PACKAGE_PATH_NOT_EXPORTED' ].includes( error.code ) ) {
      throw new FatalError( `Provider "${name}" package "${pkg}" cannot be loaded synchronously. Use a compatible version.`, { cause: error } );
    }
    throw error;
  }
};

/**
 * Return a provider by its name.
 * Look for registered providers first.
 * If none, looks for loaded providers.
 * Finally, looks for shipped providers, and if exists load it.
 *
 * @param {string} name
 * @returns {object} provider
 */
export const getProvider = name => {
  const provider = registeredProviders[name] ?? loadedProviders[name];

  if ( provider ) {
    return provider;
  }
  if ( shippedProviders[name] ) {
    return loadedProviders[name] = loadProvider( name );
  }

  throw new FatalError( `Unsupported provider "${name}"` );
};
