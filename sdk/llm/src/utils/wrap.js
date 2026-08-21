import { extractSources } from './sources.js';
import { calculateLLMCallCost } from '../cost/index.js';
import { calculateBase64FileSize } from './image.js';
import { Tracing, Event } from '@outputai/core/sdk/runtime';
import { mapAiError } from './error_handler.js';
import { isPromise } from 'node:util/types';
import { Logger } from '@outputai/core';

/** Creates a proxy of the AI SDK response and attach virtual getters to it based on an object map */
const createResponseProxy = ( { response, properties } ) => new Proxy( response, {
  get( target, prop, receiver ) {
    return Object.hasOwn( properties, prop ) ? properties[prop] : Reflect.get( target, prop, receiver );
  }
} );

/** Generate a trace id, starts the tracing and return the id */
const startTrace = ( { name, prompt } ) => {
  const traceId = `${name}-${Date.now()}`;
  Tracing.addEventStart( { kind: 'llm', id: traceId, name, details: { prompt } } );
  return traceId;
};

/** Map AI Error, add an error trace entry and return the new error */
const handleError = ( { traceId, error: originalError } ) => {
  const error = mapAiError( originalError );
  Tracing.addEventError( { id: traceId, details: error } );
  return error;
};

/** Extract usage, calculate the cost, emit an event and return cost/usage */
const handleCost = async ( { traceId, response, prompt } ) => {
  const { model: modelId, provider: providerId } = prompt.config;
  const usage = response.totalUsage ?? response.usage; // eg: image has .usage only
  const cost = await calculateLLMCallCost( { usage, modelId, providerId } );
  if ( cost ) {
    Tracing.addEventAttribute( { eventId: traceId, attribute: cost } );
    Event.emit( 'cost:llm:request', cost );
  }
  return { cost, usage };
};

/**
 * Runs a completing AI SDK call (`generateText`, `generateImage`, `generateTextWithStreaming`,
 * `Agent.generate`, `Agent.generateWithStreaming`): start the LLM trace, run `fn`, attach cost
 * (and sources on text), end the trace, and return a proxied response.
 *
 * Text responses get `result` (`text`), `cost`, and merged `sources`. Image responses get
 * `result` (`image`) and `cost`. Trace usage is `response.totalUsage` if set, otherwise `response.usage`.
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
    const { cost, usage } = await handleCost( { traceId, response, prompt } );

    if ( Array.isArray( response.images ) ) {
      const { image, images, providerMetadata } = response;
      const mappedImages = images.map( ( { mediaType, base64 } ) => ( { size: calculateBase64FileSize( base64 ), mediaType } ) );

      Tracing.addEventEnd( { id: traceId, details: { result: mappedImages, usage, cost, providerMetadata } } );
      return createResponseProxy( { response, properties: { cost, result: image } } );
    } else {
      const { text: result, providerMetadata } = response;
      const sources = extractSources( response );

      Tracing.addEventEnd( { id: traceId, details: { result, usage, cost, providerMetadata, sources } } );
      return createResponseProxy( { response, properties: { cost, sources, result } } );
    }

  } catch ( error ) {
    throw handleError( { traceId, error } );
  }
};

/**
 * Starts an LLM trace around a live AI SDK stream (`streamText`, `Agent.stream`).
 *
 * `fn` receives `onFinishHook(response, callback)` and `onErrorHook(event, callback)`. Call
 * `onFinishHook` from the SDK `onFinish`: it wraps the response, awaits `callback` (persist /
 * user `onFinish`), then ends the trace. Call `onErrorHook` from SDK `onError`: it maps the
 * error, records it, and invokes `callback` without rethrowing (user `onError` throws are ignored).
 *
 * A throw or rejected Promise from `fn` (stream creation / Agent setup) is mapped and recorded
 * on the LLM trace. A non-Promise return (the `streamText` stream) is returned immediately.
 *
 * @param {object} args
 * @param {string} args.name - Trace event name
 * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
 * @param {(hooks: { onFinishHook: Function, onErrorHook: Function }) => object | Promise<object>} args.fn -
 *   Return the SDK stream, or a Promise of that stream (`Agent.stream`); wire the hooks into SDK
 *   `onFinish` / `onError`
 * @returns {object | Promise<object>} Value returned by `fn`; a rejected Promise is remapped
 */
export const wrapStream = ( { name, prompt, fn } ) => {
  const traceId = startTrace( { name, prompt } );

  const onFinishHook = async ( response, callback ) => {
    try {
      const { text: result, providerMetadata } = response;
      const { cost, usage } = await handleCost( { traceId, response, prompt } );
      const sources = extractSources( response );

      const proxyResponse = createResponseProxy( { response, properties: { cost, sources, result } } );
      await callback?.( proxyResponse );

      Tracing.addEventEnd( { id: traceId, details: { result, usage, cost, providerMetadata, sources } } );
    } catch ( error ) {
      throw handleError( { traceId, error } );
    }
  };

  const onErrorHook = async ( event, callback ) => {
    const error = handleError( { traceId, error: event.error } );
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
    const stream = fn( { onFinishHook, onErrorHook } );
    return isPromise( stream ) ? stream.catch( error => {
      throw handleError( { traceId, error } );
    } ) : stream;
  } catch ( error ) {
    throw handleError( { traceId, error } );
  }
};
