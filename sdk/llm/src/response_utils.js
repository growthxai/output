import { Tracing, emitEvent } from '@outputai/core/sdk_activity_integration';
import { extractSourcesFromSteps } from './source_extraction.js';
import { calculateLLMCallCost } from './cost/index.js';

export const wrapInOutputResponse = async ( response, { traceId, modelId } ) => {
  const { text: result, totalUsage: usage, providerMetadata } = response;
  const sourcesFromTools = extractSourcesFromSteps( response.steps );
  const cost = await calculateLLMCallCost( { usage, modelId } );

  emitEvent( 'llm:call_cost', { modelId, cost, usage } );
  Tracing.addEventEnd( { id: traceId, details: { result, usage, cost, providerMetadata, sourcesFromTools } } );

  return new Proxy( response, {
    get( target, prop, receiver ) {
      if ( prop === 'result' ) {
        return target.text;
      }
      if ( prop === 'sources' && sourcesFromTools.length > 0 ) {
        const responseSources = Array.isArray( target[prop] ) ? target[prop] : [];
        const byUrl = new Map( [ ...sourcesFromTools, ...responseSources ].map( s => [ s.url, s ] ) );
        return [ ...byUrl.values() ];
      }
      return Reflect.get( target, prop, receiver );
    }
  } );
};
