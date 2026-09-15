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
    return { response: await fn(), error: null };
  } catch ( error ) {
    return { response: null, error };
  }
};

/**
 * Runs a completing AI SDK text call (`generateText`, `generateTextWithStreaming`,
 * `Agent.generate`, `Agent.generateWithStreaming`): start the LLM trace, run `fn`, end the trace,
 * and return the response proxied with `result` (`text`), `cost` and merged `sources`.
 *
 * `fn` receives the wiring options holding the metering telemetry and must spread them into the
 * call, so usage is metered from the SDK lifecycle events rather than from the returned response.
 * That keeps metering working when `fn` throws after the model already ran. Trace output keeps raw
 * `response.usage`; normalized usage and cost are trace attributes.
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

  const { response, error } = await inlineTry( () => fn( { telemetry } ) );

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
 * Runs `generateImage`: start the LLM trace, meter the returned usage, end the trace, and return
 * the response proxied with `result` (the first `image`) and `cost`.
 *
 * Image calls expose no telemetry lifecycle events, so usage is read from the response. There is
 * no step loop and no output parsing either, so a throw can only happen before any usage exists;
 * it is mapped and recorded without metering.
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
 * `fn` receives `onEndHook(response, callback)`, `onErrorHook(event, callback)` and
 * `onStepEndHook(stepResult)`. Call `onEndHook` from the SDK `onEnd`: it meters the response,
 * ends the trace, then invokes `callback`. Call `onErrorHook` from SDK `onError`: it meters the
 * collected steps when applicable, maps and records the error, then invokes `callback`. Call
 * `onStepEndHook` from SDK `onStepEnd`. Callback failures are logged, never rethrown.
 *
 * `onStepEndHook` collects step results so usage survives the one exit that reports nothing: when
 * the SDK raises `NoOutputGeneratedError` it skips `onEnd`, leaving the completed steps as the only
 * record of the tokens already spent. Every other exit (normal finish, provider error chunk,
 * mid-loop step failure, abort after a step) reaches `onEnd` with the usage, or the steps to
 * rebuild it.
 *
 * A throw or rejected Promise from `fn` (stream creation / Agent setup) is mapped and recorded
 * on the LLM trace. A non-Promise return (the `streamText` stream) is returned immediately.
 * When `abortSignal` aborts, its reason is recorded as an LLM trace error. The listener is removed
 * when the stream ends, reports an error, or fails during setup.
 *
 * @param {object} args
 * @param {string} args.name - Trace event name
 * @param {object} args.prompt - Loaded prompt (`config.provider` / `config.model` used for cost)
 * @param {AbortSignal} [args.abortSignal] - Optional signal used to trace stream cancellation
 * @param {( hooks: { onEndHook: Function, onErrorHook: Function, onStepEndHook: Function } ) =>
 *   object | Promise<object>} args.fn - Return the SDK stream, or a Promise of that stream
 *   (`Agent.stream`); wire the hooks into SDK `onEnd` / `onError` / `onStepEnd`
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

  const onStepEndHook = async step => {
    metering.recordStep( step );
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

  try {
    const stream = fn( { onEndHook, onErrorHook, onStepEndHook } );
    return isPromise( stream ) ? stream.catch( error => {
      removeAbortListener();
      throw handleError( { traceId, error } );
    } ) : stream;
  } catch ( error ) {
    removeAbortListener();
    throw handleError( { traceId, error } );
  }
};
