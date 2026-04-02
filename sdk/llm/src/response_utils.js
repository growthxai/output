import { extractSourcesFromSteps } from './source_extraction.js';
import { endTraceWithSuccess } from './trace_utils.js';

export const wrapInOutputResponse = async ( response, { traceId, modelId } ) => {
  const sourcesFromTools = extractSourcesFromSteps( response.steps );
  await endTraceWithSuccess( traceId, modelId, response, { sourcesFromTools } );

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
