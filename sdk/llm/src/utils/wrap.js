import { extractSources } from './sources.js';
import { serializeImagesFromResponse } from './image.js';
import { Tracing } from '@outputai/core/sdk/runtime';
import { mapAiError } from './error_handler.js';
import { isPromise } from 'node:util/types';
import { FatalError, Logger } from '@outputai/core';
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

/** Handle AI SDK errors: map them, add an error trace entry and return the new error */
const handleAiSdkError = ( { traceId, error: originalError } ) => {
  const error = mapAiError( originalError );
  Tracing.addEventError( { id: traceId, details: error } );
  return error;
};

/**
 * Handle a failure of our own response handling: wrap it, add an error trace entry and return it.
 * Fatal on purpose - such a failure is deterministic, so a retry pays for the model call again and
 * fails the same way.
 */
const handleResponseError = ( { traceId, error: cause } ) => {
  const error = new FatalError( 'AI SDK response handling failed.', { cause } );
  Tracing.addEventError( { id: traceId, details: error } );
  return error;
};

/** Invokes an async function, wrapped in a try/catch, return { result, error } */
const inlineTryAsync = async fn => {
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
 * Reading the billed response is guarded: a throw from `fn` is mapped as an SDK error, while a
 * failure of our own handling becomes a `FatalError` recorded on the trace. The proxy is built
 * before the trace ends, so a call that fails there never leaves an `end` entry next to an `error`.
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

  const { result: response, error } = await inlineTryAsync( () => fn( { telemetry } ) );

  await metering.bill();

  if ( error ) {
    throw handleAiSdkError( { traceId, error } );
  }

  try {
    const { text: result, finalStep, usage } = response;
    const providerMetadata = finalStep?.providerMetadata;
    const sources = extractSources( response );

    // Create proxy first, as this could theoretically fail
    const responseProxy = createResponseProxy( { response, properties: { cost: metering.attributes.cost, sources, result } } );
    Tracing.addEventEnd( { id: traceId, details: { result, usage, providerMetadata, sources } } );

    return responseProxy;
  } catch ( error ) {
    throw handleResponseError( { traceId, error } );
  }
};

/**
 * Runs `generateImage`: starts the LLM trace, meters the returned usage, ends the trace and returns
 * the response proxied with `result` (the first `image`) and `cost`.
 *
 * Image calls expose no telemetry lifecycle events, so usage is read from the response. With no
 * step loop and no output parsing, a throw from `fn` happens before any usage exists, so it is
 * mapped and recorded without metering. Reading the billed response is guarded the same way
 * `wrapTextGeneration` guards it: a failure there is a `FatalError` recorded after billing.
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

  const { result: response, error } = await inlineTryAsync( fn );

  if ( error ) {
    throw handleAiSdkError( { traceId, error } );
  }

  metering.recordResponse( response );
  await metering.bill();

  try {
    const { usage, image: result, providerMetadata } = response;
    const serializeImages = serializeImagesFromResponse( response );

    // Create proxy first, as this could theoretically fail
    const responseProxy = createResponseProxy( { response, properties: { cost: metering.attributes.cost, result } } );

    Tracing.addEventEnd( { id: traceId, details: { result: serializeImages, usage, providerMetadata } } );
    return responseProxy;
  } catch ( error ) {
    throw handleResponseError( { traceId, error } );
  }
};

/** Awaits a consumer callback, logging and swallowing its failures: the hooks are fire and forget */
const invokeCallback = async ( cb, args, cbName ) => {
  if ( typeof cb === 'function' ) {
    try {
      await cb( ...args );
    } catch ( e ) {
      Logger.error( `Stream ${cbName}() callback failed`, { namespace: 'LLM', error: e?.message || String( e ) } );
    }
  }
};

/**
 * Starts an LLM trace around a live AI SDK stream (`streamText`, `Agent.stream`).
 *
 * `fn` receives `onEndHook(response, callback)` and `onErrorHook(event, callback)` to wire into the
 * SDK `onEnd` / `onError`, plus `telemetry` to spread into the call. Both hooks bill, end or record
 * the trace, then invoke `callback`; a `callback` that is not a function is skipped, and callback
 * failures are logged, never rethrown.
 *
 * Neither hook throws, because the SDK invokes them through `notify`, which swallows callback
 * failures and discards their return: a failure while reading the response would vanish, so it is
 * logged and recorded as a trace error here instead. An `onError`
 * event carrying no `Error` is normalized to `Streaming failed.` with the original value as `cause`,
 * so the trace always closes and the consumer callback always runs.
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
    handleAiSdkError( { traceId, error } );
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
          handleAiSdkError( { traceId, error: new Error( 'Streaming timed out.' ) } );
        }
      }
    }
  };

  const onEndHook = async ( response, callback ) => {
    removeAbortListener();

    metering.recordResponse( response );
    await metering.bill();

    try {
      const { text: result, finalStep, usage } = response;
      const providerMetadata = finalStep?.providerMetadata;
      const sources = extractSources( response );

      const proxyResponse = createResponseProxy( { response, properties: { cost: metering.attributes.cost, sources, result } } );
      Tracing.addEventEnd( { id: traceId, details: { result, usage, providerMetadata, sources } } );

      await invokeCallback( callback, [ proxyResponse ], 'onEnd' );
    } catch ( error ) {
      Logger.error( 'AI SDK response handling failed', { namespace: 'LLM', error: error?.message || String( error ) } );
      handleResponseError( { traceId, error } );
    }
  };

  const onErrorHook = async ( event, callback ) => {
    removeAbortListener();
    await metering.bill();

    const error = event?.error instanceof Error ? event.error : new Error( 'Streaming failed.', { cause: event?.error } );
    const mappedError = handleAiSdkError( { traceId, error } );
    await invokeCallback( callback, [ mappedError ], 'onError' );
  };

  const handleStreamError = error => {
    removeAbortListener();
    return handleAiSdkError( { traceId, error } );
  };

  const addStreamOutputErrorHandler = stream => {
    stream.output?.catch( error => handleAiSdkError( { traceId, error } ) );
    return stream;
  };

  const createStream = () => {
    try {
      return fn( { onEndHook, onErrorHook, telemetry } );
    } catch ( error ) {
      throw handleStreamError( error );
    }
  };

  const stream = createStream();

  /** Streams can be a promise or not, for both cases add the handler to catch .output errors, and if it is a promise add a .catch handler to observe errors there as well */
  return isPromise( stream ) ?
    stream.then( addStreamOutputErrorHandler ).catch( e => {
      throw handleStreamError( e );
    } ) :
    addStreamOutputErrorHandler( stream );
};
