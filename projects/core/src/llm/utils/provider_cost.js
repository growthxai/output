import Decimal from 'decimal.js';
import { isNonNegativeNumber } from '#helpers/number';
import { LLMGenerationCost } from './attributes/llm_generation_cost.js';
import { serializeError } from '#helpers/error_serializer';
import { Logger } from '#runtime_logger';

/**
 * Builds an {@link LLMGenerationCost} from a provider-reported dollar amount per step.
 *
 * Never reads models.dev. Empty or missing amounts yield `total: null` and status `incomplete`.
 *
 * @param {import('./attributes/llm_generation_usage.js').LLMGenerationUsage} usage - normalized usage
 * @param {object[]} steps - AI SDK steps (or recorded steps) carrying `providerMetadata`
 * @param {(providerMetadata: object|undefined) => number|null} extractStepCost - registered step cost extractor
 * @returns {LLMGenerationCost}
 */
export const calculateProviderCosts = ( usage, steps, extractStepCost ) => {
  const { modelId, providerId, promptName, requestDetails } = usage;
  const stepList = Array.isArray( steps ) ? steps : [];

  const stepCosts = stepList
    .map( step => {
      try {
        return extractStepCost( step?.providerMetadata );
      } catch ( error ) {
        Logger.warn( 'Error on extractStepCost()', {
          namespace: 'LLM',
          providerId,
          error: serializeError( error )
        } );
        return null;
      }
    } )
    .filter( a => isNonNegativeNumber( a ) );

  const total = stepCosts.length > 0 ? stepCosts.reduce( ( s, v ) => s.add( v ), Decimal( 0 ) ).toNumber() : null;
  const status = stepCosts.length === stepList.length && stepList.length > 0 ?
    LLMGenerationCost.Status.PRECISE :
    LLMGenerationCost.Status.INCOMPLETE;

  return LLMGenerationCost.buildFromProvider( { modelId, providerId, promptName, requestDetails, total, status } );
};
