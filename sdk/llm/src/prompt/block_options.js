import { FatalError, z } from '@outputai/core';

/**
 * Resolve the providerOptions namespace for the `cache` shorthand. Anthropic prompt caching is
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

/** Shallow-merge two providerOptions objects, combining keys within each provider namespace. */
const mergeProviderOptions = ( base = {}, extra = {} ) => {
  const merged = { ...base };
  for ( const [ namespace, options ] of Object.entries( extra ) ) {
    merged[namespace] = { ...merged[namespace], ...options };
  }
  return merged;
};

/** Expand the `cache` shorthand into a provider-namespaced `cacheControl` providerOptions object. */
const resolveCache = ( value, { name, config } ) => {
  const namespace = cacheNamespace( config );
  if ( !namespace ) {
    console.warn(
      `[output-llm] Prompt "${name}": "cache" shorthand only supports Anthropic models; ` +
      `ignoring for provider "${config.provider}". Use messageOptions to cache on other providers.`
    );
    return {};
  }
  const cacheControl = { type: 'ephemeral', ...( typeof value === 'string' && { ttl: value } ) };
  return { [namespace]: { cacheControl } };
};

/** Merge the named `messageOptions` sets referenced by a block's `options` attribute. */
const resolveOptions = ( value, { name, config } ) => {
  const sets = config.messageOptions ?? {};
  return value.trim().split( /\s+/ ).reduce( ( acc, setName ) => {
    if ( !sets[setName] ) {
      throw new FatalError( `Prompt "${name}" references unknown messageOptions set "${setName}"` );
    }
    return mergeProviderOptions( acc, sets[setName] );
  }, {} );
};

/**
 * Registry of supported block attributes. Each entry declares how the attribute is validated
 * (`schema`) and how it contributes to a message's per-message `providerOptions` (`resolve`).
 * Add an entry to support a new block option — validation ({@link attributesSchema}) and
 * resolution ({@link resolveMessageProviderOptions}) both derive from this table.
 */
const BLOCK_OPTIONS = {
  cache: {
    schema: z.union( [ z.boolean(), z.enum( [ '5m', '1h' ] ) ] ),
    resolve: resolveCache
  },
  options: {
    schema: z.string().min( 1 ),
    resolve: resolveOptions
  }
};

/** Zod schema for a block's `attributes` object, derived from the option registry. */
export const attributesSchema = z.object(
  Object.fromEntries(
    Object.entries( BLOCK_OPTIONS ).map( ( [ name, def ] ) => [ name, def.schema.optional() ] )
  )
).strict();

/**
 * Resolve each message's authoring `attributes` into AI SDK per-message `providerOptions`,
 * returning clean messages with the `attributes` helper stripped.
 *
 * @param {object} prompt - Loaded prompt object (`{ name, config, messages }`)
 * @returns {Array<object>} Messages with resolved `providerOptions`
 */
export const resolveMessageProviderOptions = ( { name, config, messages } ) =>
  messages.map( ( { attributes, providerOptions, ...message } ) => {
    const resolved = Object.entries( attributes ?? {} ).reduce( ( acc, [ key, value ] ) => {
      const option = BLOCK_OPTIONS[key];
      return option ? mergeProviderOptions( acc, option.resolve( value, { name, config } ) ) : acc;
    }, providerOptions ?? {} );

    return Object.keys( resolved ).length > 0 ? { ...message, providerOptions: resolved } : message;
  } );
