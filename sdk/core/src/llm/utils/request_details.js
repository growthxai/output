import { LLMRequestDetails } from './models/llm_generation.js';

export const parseRequestDetails = ( { requestsHeaders, duration } ) => {
  const ids = requestsHeaders.map( h => h?.['request-id'] ?? h?.['x-request-id'] ).filter( Boolean );

  return new LLMRequestDetails( ids, requestsHeaders.length, duration );
};
