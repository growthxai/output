import { combineSources, extractSourcesFromSteps } from './source_extraction.js';
import { calculateLLMCallCost } from '../cost/index.js';
import { endTraceWithError, endTraceWithSuccess } from './trace.js';

/**
 * Calculates the cost and wraps an AI SDK text response in a Proxy with shortcut for 'result' and 'cost'
 *
 * Emits the `llm:call_cost` event.
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
  const sourcesFromTools = extractSourcesFromSteps( response.steps );
  const cost = await calculateLLMCallCost( { usage: response.totalUsage, modelId } );

  endTraceWithSuccess( { traceId, modelId, response, cost, sourcesFromTools } );

  return new Proxy( response, {
    get( target, prop, receiver ) {
      if ( prop === 'result' ) {
        return target.text;
      }
      if ( prop === 'cost' ) {
        return cost;
      }
      if ( prop === 'sources' && sourcesFromTools.length > 0 ) {
        return combineSources( { sourcesFromTools, sourcesFromResponse: response.sources } );
      }
      return Reflect.get( target, prop, receiver );
    }
  } );
};

/**
 * Adds actions to the stream callbacks.
 *
 * onFinish: Concludes the trace event, calculates cost and emits `llm:call_cost`.
 * Returns a proxy around the response with `cost` property.
 *
 * onError: Concludes the trace event
 *
 * @param {object} args
 * @param {string} args.traceId - id created by the startTrace
 * @param {string} args.modelId - id of the model used
 * @param {Function} args.onFinish - User added callback
 * @param {Function} args.onError - User added callback
 * @returns {object} Proxied response
 */
export const wrapStreamOnFinishResponse = ( { traceId, modelId, onFinish: userOnFinish, onError: userOnError } ) => ( {
  async onFinish( response ) {
    const cost = await calculateLLMCallCost( { modelId, usage: response.totalUsage } );

    endTraceWithSuccess( { traceId, modelId, response, cost } );

    userOnFinish?.( new Proxy( response, {
      get( target, prop, receiver ) {
        if ( prop === 'result' ) {
          return target.text;
        }
        if ( prop === 'cost' ) {
          return cost;
        }
        return Reflect.get( target, prop, receiver );
      }
    } ) );
  },
  onError( event ) {
    endTraceWithError( { traceId, error: event.error } );
    userOnError?.( event );
  }
} );
