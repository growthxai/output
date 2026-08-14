import { types as utilTypes } from 'node:util';
import { combineSources, extractSourcesFromSteps } from './source_extraction.js';
import { calculateLLMCallCost } from '../cost/index.js';
import { endTraceWithSuccess } from './trace.js';
import { calculateBase64FileSize } from './image.js';

/**
 * Rethrows a captured onError when the caller consumes the stream result.
 *
 * @param {object} result - AI SDK streamText result
 * @param {object} state - State object it will have .error property set if the streamText failed
 * @returns {object} Proxied result
 */
export const wrapStreamResult = ( result, state ) => new Proxy( result, {
  get( target, prop ) {
    // if accessing the textStream, create a proxy that intercepts async iterator
    if ( prop === 'textStream' ) {
      const stream = target[prop];
      return new Proxy( stream, {
        get( target, prop ) {
          if ( prop === Symbol.asyncIterator ) {
            return async function *() {
              try {
                for await ( const chunk of stream ) {
                  yield chunk;
                }
              } catch ( error ) {
                // on error first check for error state, it might have the root cause
                throw state.error ?? error;
              }
              // on finished stream, also check for error state
              if ( state.error ) {
                throw state.error;
              }
            };
          }
          const value = target[prop];
          return typeof value === 'function' ? value.bind( target ) : value;
        }
      } );
    }

    const value = target[prop];
    // if it is a promise property, like .text, add a handler to check for root error
    if ( utilTypes.isPromise( value ) ) {
      return value.then(
        // even when the promise resolves, check for stored errors
        result => {
          if ( state.error ) {
            throw state.error;
          }
          return result;
        },
        error => {
          throw state.error ?? error;
        }
      );
    }

    return typeof value === 'function' ? value.bind( target ) : value;
  }
} );

/**
 * Calculates the cost and wraps an AI SDK text response in a Proxy with shortcut for 'result' and 'cost'
 *
 * Emits the `cost:llm:request` event.
 *
 * Also finishes the trace events.
 *
 * @param {object} args
 * @param {string} args.traceId - id created by the startTrace
 * @param {string} args.providerId - id of the provider used
 * @param {string} args.modelId - id of the model used
 * @param {object} args.response - AI SDK's text response
 * @returns {object} Proxied response
 */
export const wrapTextResponse = async ( { traceId, providerId, modelId, response } ) => {
  const { totalUsage: usage, providerMetadata, text: result, steps, sources } = response;

  const cost = await calculateLLMCallCost( { usage, modelId, providerId } );
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
 * Calculates the cost and wraps an AI SDK image response in a Proxy with shortcut for 'result' and 'cost'
 *
 * Emits the `cost:llm:request` event.
 *
 * Also finishes the trace events.
 *
 * @param {object} args
 * @param {string} args.traceId - id created by the startTrace
 * @param {string} args.providerId - id of the provider used
 * @param {string} args.modelId - id of the model used
 * @param {object} args.response - AI SDK's image response
 * @returns {object} Proxied response
 */
export const wrapImageResponse = async ( { traceId, providerId, modelId, response } ) => {
  const { usage, providerMetadata } = response;
  const cost = await calculateLLMCallCost( { usage, providerId, modelId } );

  const result = response.images.map( ( { mediaType, base64 } ) => ( {
    size: calculateBase64FileSize( base64 ),
    mediaType
  } ) );

  endTraceWithSuccess( { traceId, usage, cost, result, providerMetadata } );

  return new Proxy( response, {
    get( target, prop, receiver ) {
      if ( prop === 'result' ) {
        return target.image;
      }
      if ( prop === 'cost' ) {
        return cost;
      }
      return Reflect.get( target, prop, receiver );
    }
  } );
};
