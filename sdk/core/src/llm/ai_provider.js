import { z } from 'zod';
import { FatalError, ValidationError } from '#errors';
import { EnvHttpProxyAgent, fetch } from 'undici';
import { deprecatedProviderAliases } from './deprecated_provider_aliases.js';
import { resolveGoogleVertexAuthOptions } from './utils/google_vertex_auth.js';

/** This custom dispatcher has longer timeouts. */
const customDispatcher = new EnvHttpProxyAgent( {
  headersTimeout: 15 * 60 * 1000, // 15 min
  bodyTimeout: 15 * 60 * 1000,
  allowH2: false // Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299
} );

/** This custom fetch instance uses the custom dispatcher */
const customFetch = ( input, init ) => fetch( input, { dispatcher: customDispatcher, ...init } );

/** Shipped providers. Their packages are optional peer dependencies, so any of them may be missing. */
const shippedProviders = {
  'amazon-bedrock': {
    pkg: '@ai-sdk/amazon-bedrock',
    load: async () => ( await import( '@ai-sdk/amazon-bedrock' ) ).createAmazonBedrock
  },
  anthropic: {
    pkg: '@ai-sdk/anthropic',
    load: async () => ( await import( '@ai-sdk/anthropic' ) ).createAnthropic
  },
  azure: {
    pkg: '@ai-sdk/azure',
    load: async () => ( await import( '@ai-sdk/azure' ) ).createAzure
  },
  'google-vertex': {
    pkg: '@ai-sdk/google-vertex',
    load: async () => {
      const { createVertex } = await import( '@ai-sdk/google-vertex' );
      return options => createVertex( { ...options, ...resolveGoogleVertexAuthOptions() } );
    }
  },
  openai: {
    pkg: '@ai-sdk/openai',
    load: async () => ( await import( '@ai-sdk/openai' ) ).createOpenAI
  },
  perplexity: {
    pkg: '@ai-sdk/perplexity',
    load: async () => ( await import( '@ai-sdk/perplexity' ) ).createPerplexity
  }
};

/** Load a shipped provider initializer, or null when its package is not installed. */
const loadInitializer = async ( { pkg, load } ) => {
  try {
    return await load();
  } catch ( error ) {
    if ( error?.code === 'ERR_MODULE_NOT_FOUND' && String( error.message ).includes( pkg ) ) {
      return null;
    }
    throw error;
  }
};

/** Available provider to initialize: the shipped providers whose package is installed. */
const providerInitializers = Object.fromEntries(
  ( await Promise.all( Object.entries( shippedProviders ).map( async ( [ name, provider ] ) => [ name, await loadInitializer( provider ) ] ) ) )
    .filter( ( [ , initializer ] ) => initializer )
);

/** Providers already initialized due usage */
const initializedProviders = {};

/** Providers registered by the user */
const registeredProviders = {};

/**
 * Get all available provider names: shipped providers whose package is installed, plus registered ones.
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
export const registerProvider = ( name, providerFn ) => {
  const result = registerProviderSchema.safeParse( { name, providerFn } );
  if ( !result.success ) {
    throw new ValidationError( `Invalid provider registration: ${z.prettifyError( result.error )}` );
  }
  if ( Object.hasOwn( deprecatedProviderAliases, name ) ) {
    const canonical = deprecatedProviderAliases[name];
    throw new ValidationError(
      `Cannot register provider "${name}": that name is a deprecated alias for "${canonical}". Register "${canonical}" instead.`
    );
  }
  registeredProviders[name] = providerFn;
};

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
  if ( shippedProviders[name] ) {
    throw new FatalError( `Provider "${name}" requires the "${shippedProviders[name].pkg}" package, which is not installed` );
  }

  throw new FatalError( `Unsupported provider "${name}"` );
};
