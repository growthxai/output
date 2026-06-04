import { combineSources, extractSourcesFromSteps } from './source_extraction.js';
import { calculateLLMCallCost } from '../cost/index.js';
import { endTraceWithSuccess } from './trace.js';
import { calculateBase64FileSize } from './image.js';

/**
 * Calculates the cost and wraps an AI SDK text response in a Proxy with shortcut for 'result' and 'cost'
 *
 * Emits the `cost:llm:request` event.
 *
 * Also finishes the trace events.
 *
 * @param {object} args
 * @param {string} args.traceId - id created by the startTrace
 * @param {string} args.modelId - id of the model used
 * @param {object} args.response - AI SDK's text response
 * @returns {object} Proxied response
 */
export const wrapTextResponse = async ( { traceId, modelId, response } ) => {
  const { totalUsage: usage, providerMetadata, text: result, steps, sources } = response;

  const cost = await calculateLLMCallCost( { usage, modelId } );
  const sourcesFromTools = extractSourcesFromSteps( steps );

  endTraceWithSuccess( { traceId, usage, cost, result, providerMetadata, sourcesFromTools } );

  return new Proxy( response, {
    get( target, prop, receiver ) {
      if ( prop === 'result' ) {
        return target.text;
      }
      if ( prop === 'cost' ) {
        return cost;
      }
      if ( prop === 'sources' && sourcesFromTools.length > 0 ) {
        return combineSources( { sourcesFromTools, sourcesFromResponse: sources } );
      }
      return Reflect.get( target, prop, receiver );
    }
  } );
};

/**
 * Wraps the response returned by the onFinish callback from the stream.
 *
 * When the onFinish is triggered, concludes the trace event, calculates cost and emits `cost:llm:request`.
 * Returns a proxy around the response with `cost` property.
 *
 * @param {object} args
 * @param {string} args.traceId - id created by the startTrace
 * @param {string} args.modelId - id of the model used
 * @param {Function} args.onFinish - Original callback to call with the proxied response
 * @returns {object} Proxied response
 */
export const wrapStreamOnFinishResponse = ( { traceId, modelId, onFinish: _onFinish } ) => ( {
  async onFinish( response ) {
    const proxiedResponse = await wrapTextResponse( { traceId, modelId, response } );
    _onFinish?.( proxiedResponse );
  }
} );

/**
 * Calculates the cost and wraps an AI SDK image response in a Proxy with shortcut for 'result' and 'cost'
 *
 * Emits the `cost:llm:request` event.
 *
 * Also finishes the trace events.
 *
 * @param {object} args
 * @param {string} args.traceId - id created by the startTrace
 * @param {string} args.modelId - id of the model used
 * @param {object} args.response - AI SDK's image response
 * @returns {object} Proxied response
 */
export const wrapImageResponse = async ( { traceId, modelId, response } ) => {
  const { usage, providerMetadata } = response;
  const cost = await calculateLLMCallCost( { usage, modelId } );

  const result = response.images.map( ( { mediaType, base64Data } ) => ( {
    size: calculateBase64FileSize( base64Data ),
    mediaType
  } ) );

  endTraceWithSuccess( { traceId, usage, cost, result, providerMetadata } );

  return new Proxy( response, {
    get( target, prop, receiver ) {
      if ( prop === 'result' ) {
        return target.images[0];
      }
      if ( prop === 'cost' ) {
        return cost;
      }
      return Reflect.get( target, prop, receiver );
    }
  } );
};
