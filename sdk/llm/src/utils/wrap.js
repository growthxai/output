import { extractSources } from './sources.js';
import { parseLLMUsage } from './usage.js';
import { calculateCosts } from './cost.js';
import { calculateBase64FileSize } from './image.js';
import { Tracing, Event } from '@outputai/core/sdk/runtime';
import { mapAiError } from './error_handler.js';
import { isPromise } from 'node:util/types';
import { Logger } from '@outputai/core';
import { convertCostToLegacy } from './legacy_cost_attribute.js';
import { randomBytes } from 'node:crypto';

/** Creates a proxy of the AI SDK response and attach virtual getters to it based on an object map */
const createResponseProxy = ( { response, properties } ) => new Proxy( response, {
  get( target, prop, receiver ) {
    return Object.hasOwn( properties, prop ) ? properties[prop] : Reflect.get( target, prop, receiver );
  }
} );

/** Generate a trace id, starts the tracing and return the id */
const startTrace = ( { name, prompt } ) => {
  const traceId = `${name}-${Date.now()}-${randomBytes( 4 ).toString( 'hex' )}`;
  Tracing.addEventStart( { kind: 'llm', id: traceId, name, details: { prompt } } );
  return traceId;
};

/** Map AI Error, add an error trace entry and return the new error */
const handleError = ( { traceId, error: originalError } ) => {
  const error = mapAiError( originalError );
  Tracing.addEventError( { id: traceId, details: error } );
  return error;
};

/** Normalize raw AI SDK usage, calculate cost, attach trace attributes, and emit metering events */
const handleMetering = async ( { traceId, usage: sdkUsage, prompt } ) => {
  const usageAttribute = parseLLMUsage( { usage: sdkUsage, prompt } );
  if ( !usageAttribute ) {
    return null;
  }

  const costAttribute = await calculateCosts( usageAttribute );
  if ( costAttribute ) {
    Tracing.addEventAttribute( { eventId: traceId, attribute: costAttribute } );
    // @TEMP Preserve the deprecated event and trace attribute for legacy consumers.
    const legacyPayload = convertCostToLegacy( costAttribute );
    if ( legacyPayload ) {
      Event.emit( 'cost:llm:request', structuredClone( legacyPayload ) );
      Tracing.addEventAttribute( { eventId: traceId, attribute: legacyPayload } );
    }
  }

  Tracing.addEventAttribute( { eventId: traceId, attribute: usageAttribute } );
  Event.emit( 'llm:generation:metering', structuredClone( { cost: costAttribute, usage: usageAttribute } ) );
  return costAttribute;
};

/**
 * Runs a completing AI SDK call (`generateText`, `generateImage`, `generateTextWithStreaming`,
 * `Agent.generate`, `Agent.generateWithStreaming`): start the LLM trace, run `fn`, attach cost
 * (and sources on text), end the trace, and return a proxied response.
 *
 * Text responses get `result` (`text`), `cost`, and merged `sources`. Image responses get
 * `result` (`image`) and `cost`. Trace output keeps raw `response.usage`; normalized usage and
 * cost are trace attributes.
 *
 * @param {object} args
 * @param {string} args.name - Trace event name
 * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
 * @param {() => Promise<object>} args.fn - AI SDK call; must return the SDK response
 * @returns {Promise<object>} Proxied SDK response
 */
export const wrapGeneration = async ( { name, prompt, fn } ) => {
  const traceId = startTrace( { name, prompt } );

  try {
    const response = await fn();
    const { usage } = response;
    const cost = await handleMetering( { traceId, usage, prompt } );

    if ( Array.isArray( response.images ) ) {
      const { image, images, providerMetadata } = response;
      const mappedImages = images.map( ( { mediaType, base64 } ) => ( { size: calculateBase64FileSize( base64 ), mediaType } ) );

      Tracing.addEventEnd( { id: traceId, details: { result: mappedImages, usage, providerMetadata } } );
      return createResponseProxy( { response, properties: { cost, result: image } } );
    } else {
      const { text: result, finalStep } = response;
      const { providerMetadata } = finalStep;
      const sources = extractSources( response );

      Tracing.addEventEnd( { id: traceId, details: { result, usage, providerMetadata, sources } } );
      return createResponseProxy( { response, properties: { cost, sources, result } } );
    }

  } catch ( error ) {
    throw handleError( { traceId, error } );
  }
};

/**
 * Starts an LLM trace around a live AI SDK stream (`streamText`, `Agent.stream`).
 *
 * `fn` receives `onEndHook(response, callback)` and `onErrorHook(event, callback)`. Call
 * `onEndHook` from the SDK `onEnd`: it wraps the response, ends the trace, then invokes
 * `callback` without rethrowing. Call `onErrorHook` from SDK `onError`: it maps the error,
 * records it, and invokes `callback` without rethrowing. Callback failures are logged.
 *
 * A throw or rejected Promise from `fn` (stream creation / Agent setup) is mapped and recorded
 * on the LLM trace. A non-Promise return (the `streamText` stream) is returned immediately.
 *
 * @param {object} args
 * @param {string} args.name - Trace event name
 * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
 * @param {(hooks: { onEndHook: Function, onErrorHook: Function }) => object | Promise<object>} args.fn -
 *   Return the SDK stream, or a Promise of that stream (`Agent.stream`); wire the hooks into SDK
 *   `onEnd` / `onError`
 * @returns {object | Promise<object>} Value returned by `fn`; a rejected Promise is remapped
 */
export const wrapStream = ( { name, prompt, abortSignal, fn } ) => {
  const traceId = startTrace( { name, prompt } );

  const onAbortHook = reason =>
    handleError( {
      traceId,
      error: reason instanceof Error ? reason : new Error( 'Streaming aborted.', { cause: reason } )
    } );

  const handleAbort = () => {
    if ( !abortSignal ) {
      return () => {};
    }

    if ( abortSignal.aborted ) {
      onAbortHook( abortSignal.reason );
      return () => {};
    }

    const listener = () => onAbortHook( abortSignal.reason );
    abortSignal.addEventListener( 'abort', listener, { once: true } );

    return () => abortSignal.removeEventListener( 'abort', listener );
  };

  const removeAbortListener = handleAbort();

  const onEndHook = async ( response, callback ) => {
    const state = { proxyResponse: null };
    removeAbortListener();
    try {
      const { text: result, finalStep, usage } = response;
      const { providerMetadata } = finalStep;
      const cost = await handleMetering( { traceId, usage, prompt } );
      const sources = extractSources( response );
      Tracing.addEventEnd( { id: traceId, details: { result, usage, providerMetadata, sources } } );
      state.proxyResponse = createResponseProxy( { response, properties: { cost, sources, result } } );
    } catch ( error ) {
      Logger.error( 'Stream onEnd() handler failed', { namespace: 'LLM', error: error?.message ?? String( error ) } );
      throw handleError( { traceId, error } );
    }

    try {
      await callback?.( state.proxyResponse );
    } catch ( callbackError ) {
      // ignore these as this callback is fire and forget
      Logger.error( 'Stream onEnd() callback failed', {
        namespace: 'LLM',
        error: callbackError instanceof Error ? callbackError.message : String( callbackError )
      } );
    }
  };

  const onErrorHook = async ( event, callback ) => {
    const error = handleError( { traceId, error: event.error } );
    removeAbortListener();
    try {
      await callback?.( error );
    } catch ( callbackError ) {
      // ignore these as this callback is fire and forget
      Logger.error( 'Stream onError() callback failed', {
        namespace: 'LLM',
        error: callbackError instanceof Error ? callbackError.message : String( callbackError )
      } );
    }
  };

  try {
    const stream = fn( { onEndHook, onErrorHook } );
    return isPromise( stream ) ? stream.catch( error => {
      removeAbortListener();
      throw handleError( { traceId, error } );
    } ) : stream;
  } catch ( error ) {
    removeAbortListener();
    throw handleError( { traceId, error } );
  }
};
