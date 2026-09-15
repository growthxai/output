import { extractSources } from './sources.js';
import { calculateBase64FileSize } from './image.js';
import { Tracing } from '@outputai/core/sdk/runtime';
import { mapAiError } from './error_handler.js';
import { isPromise } from 'node:util/types';
import { Logger } from '@outputai/core';
import { Metering } from './metering.js';
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

const inlineTry = async fn => {
  try {
    return { result: await fn(), error: null };
  } catch ( error ) {
    return { result: null, error };
  }
};

/**
 * Runs a completing AI SDK text call (`generateText`, `generateTextWithStreaming`,
 * `Agent.generate`, `Agent.generateWithStreaming`): starts the LLM trace, runs `fn`, ends the trace
 * and returns the response proxied with `result` (`text`), `cost` and merged `sources`.
 *
 * `fn` must spread the wiring options into the call, so usage is metered from the SDK lifecycle
 * events instead of the returned response and still lands when `fn` throws after the model ran.
 * Trace output keeps raw `response.usage`; normalized usage and cost are trace attributes.
 *
 * @param {object} args
 * @param {string} args.name - Trace event name
 * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
 * @param {( wiringOptions: { telemetry: object } ) => Promise<object>} args.fn - AI SDK call; spread
 *   `wiringOptions` into the call options and return the SDK response
 * @returns {Promise<object>} Proxied SDK response
 */
export const wrapTextGeneration = async ( { name, prompt, fn } ) => {
  const traceId = startTrace( { name, prompt } );

  const metering = new Metering( { traceId, prompt } );

  const telemetry = {
    integrations: {
      onStepEnd: metering.recordStep,
      onEnd: metering.recordResponse
    }
  };

  const { result: response, error } = await inlineTry( () => fn( { telemetry } ) );

  await metering.bill();

  if ( error ) {
    throw handleError( { traceId, error } );
  }

  const { text: result, finalStep, usage } = response;
  const providerMetadata = finalStep?.providerMetadata;
  const sources = extractSources( response );

  Tracing.addEventEnd( { id: traceId, details: { result, usage, providerMetadata, sources } } );
  return createResponseProxy( { response, properties: { cost: metering.attributes.cost, sources, result } } );
};

/**
 * Runs `generateImage`: starts the LLM trace, meters the returned usage, ends the trace and returns
 * the response proxied with `result` (the first `image`) and `cost`.
 *
 * Image calls expose no telemetry lifecycle events, so usage is read from the response. With no
 * step loop and no output parsing, a throw can only happen before any usage exists; it is mapped
 * and recorded without metering.
 *
 * @param {object} args
 * @param {string} args.name - Trace event name
 * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
 * @param {() => Promise<object>} args.fn - AI SDK call; must return the SDK response
 * @returns {Promise<object>} Proxied SDK response
 */
export const wrapImageGeneration = async ( { name, prompt, fn } ) => {
  const traceId = startTrace( { name, prompt } );

  const metering = new Metering( { traceId, prompt } );
  try {
    const response = await fn();

    metering.recordResponse( response );
    await metering.bill();

    const { usage, image, images, providerMetadata } = response;
    const mappedImages = images.map( ( { mediaType, base64 } ) => ( { size: calculateBase64FileSize( base64 ), mediaType } ) );

    Tracing.addEventEnd( { id: traceId, details: { result: mappedImages, usage, providerMetadata } } );
    return createResponseProxy( { response, properties: { cost: metering.attributes.cost, result: image } } );

  } catch ( error ) {
    throw handleError( { traceId, error } );
  }
};

/**
 * Starts an LLM trace around a live AI SDK stream (`streamText`, `Agent.stream`).
 *
 * `fn` receives `onEndHook(response, callback)` and `onErrorHook(event, callback)` to wire into the
 * SDK `onEnd` / `onError`, plus `telemetry` to spread into the call. Both hooks bill, end or record
 * the trace, then invoke `callback`; callback failures are logged, never rethrown.
 *
 * Metering is fed by `telemetry`, where `onStepEnd` collects step usage so the tokens survive the
 * exits that report no response: `NoOutputGeneratedError` skips `onEnd`, and an abort fires neither
 * terminal hook. The SDK awaits its `onAbort` before enqueueing the abort part, so billing from
 * there always lands before the consumer observes the cancellation.
 *
 * A throw or rejected Promise from `fn` (stream creation / Agent setup) is mapped and recorded on
 * the trace; a non-Promise return (the `streamText` stream) is returned as is, with a rejection of
 * its `output` promise recorded without being swallowed from the consumer. An abort on
 * `abortSignal` records its reason as a trace error, and the listener is removed when the stream
 * ends, reports an error, or fails during setup. An abort the SDK raises on its own timeout leaves
 * `abortSignal` untouched, so `onAbort` records that one instead.
 *
 * @param {object} args
 * @param {string} args.name - Trace event name
 * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
 * @param {AbortSignal} [args.abortSignal] - Optional signal used to trace stream cancellation
 * @param {( wiring: { onEndHook: Function, onErrorHook: Function, telemetry: object } ) =>
 *   object | Promise<object>} args.fn - Return the SDK stream, or a Promise of that stream
 *   (`Agent.stream`)
 * @returns {object | Promise<object>} Value returned by `fn`; a rejected Promise is remapped
 */
export const wrapStream = ( { name, prompt, abortSignal, fn } ) => {
  const traceId = startTrace( { name, prompt } );
  const metering = new Metering( { traceId, prompt } );

  const handleAbort = () => {
    const error = abortSignal?.reason instanceof Error ? abortSignal.reason : new Error( 'Streaming aborted.', { cause: abortSignal?.reason } );
    handleError( { traceId, error } );
  };

  if ( abortSignal ) {
    if ( abortSignal.aborted ) {
      handleAbort();
    } else {
      abortSignal.addEventListener( 'abort', handleAbort, { once: true } );
    }
  }
  const removeAbortListener = () => abortSignal?.removeEventListener( 'abort', handleAbort );

  const telemetry = {
    integrations: {
      onStepEnd: metering.recordStep,
      onAbort: async () => {
        await metering.bill();
        // abortion was caused by timeout and not signal
        if ( !abortSignal?.aborted ) {
          handleError( { traceId, error: new Error( 'Streaming timed out.' ) } );
        }
      }
    }
  };

  const onEndHook = async ( response, callback ) => {
    removeAbortListener();

    metering.recordResponse( response );
    await metering.bill();

    const { text: result, finalStep, usage } = response;
    const sources = extractSources( response );
    Tracing.addEventEnd( { id: traceId, details: { result, usage, providerMetadata: finalStep?.providerMetadata, sources } } );
    const proxyResponse = createResponseProxy( { response, properties: { cost: metering.attributes.cost, sources, result } } );

    // ignore callback errors as this callback is fire and forget
    try {
      await callback?.( proxyResponse );
    } catch ( e ) {
      Logger.error( 'Stream onEnd() callback failed', { namespace: 'LLM', error: e?.message ?? String( e ) } );
    }

    return proxyResponse;
  };

  const onErrorHook = async ( event, callback ) => {
    removeAbortListener();

    await metering.bill();

    const error = handleError( { traceId, error: event.error } );

    // ignore these as this callback is fire and forget
    try {
      await callback?.( error );
    } catch ( e ) {
      Logger.error( 'Stream onError() callback failed', { namespace: 'LLM', error: e?.message ?? String( e ) } );
    }
  };

  /** The consumer owns `stream.output`, so its rejection only reaches the trace if we observe it too */
  const recordOutputError = stream => {
    stream?.output?.catch( error => handleError( { traceId, error } ) );
    return stream;
  };

  try {
    const stream = fn( { onEndHook, onErrorHook, telemetry } );
    return isPromise( stream ) ? stream.then( recordOutputError ).catch( error => {
      removeAbortListener();
      throw handleError( { traceId, error } );
    } ) : recordOutputError( stream );
  } catch ( error ) {
    removeAbortListener();
    throw handleError( { traceId, error } );
  }
};
