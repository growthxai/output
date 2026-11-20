import Decimal from 'decimal.js';
import { isNonNegativeNumber } from '#helpers/number';
import { LLMGenerationCost } from './attributes/llm_generation_cost.js';
import { serializeError } from '#helpers/error_serializer';
import { Logger } from '#runtime_logger';

/**
 * Steps for provider-reported cost when the call has none: `finalStep`, else top-level
 * `providerMetadata` as a single synthetic step. Real steps (response or recorded) win first.
 *
 * @param {object} args
 * @param {object[]} args.steps - Steps already chosen by metering (`response.steps` or recorded)
 * @param {object|null|undefined} [args.response] - AI SDK response, when present
 * @returns {object[]}
 */
export const resolveProviderCostSteps = ( { steps, response } ) => {
  if ( steps.length > 0 ) {
    return steps;
  }
  if ( response?.finalStep ) {
    return [ response.finalStep ];
  }
  if ( response?.providerMetadata !== undefined && response.providerMetadata !== null ) {
    return [ { providerMetadata: response.providerMetadata } ];
  }
  return [];
};

/**
 * Builds an {@link LLMGenerationCost} from a provider-reported dollar amount per step.
 *
 * Never reads models.dev. Empty or missing amounts yield `total: null` and status `incomplete`.
 * With no steps, falls back via {@link resolveProviderCostSteps}.
 *
 * @param {object} args
 * @param {import('./attributes/llm_generation_usage.js').LLMGenerationUsage} args.usage - normalized usage
 * @param {object[]} args.steps - AI SDK steps (or recorded steps) carrying `providerMetadata`
 * @param {object|null|undefined} [args.response] - AI SDK response used only when `steps` is empty
 * @param {(providerMetadata: object|undefined) => number|null} args.extractor - registered step cost extractor
 * @returns {LLMGenerationCost}
 */
export const calculateProviderCosts = ( { usage, steps, response, extractor } ) => {
  const { modelId, providerId, promptName, requestDetails } = usage;
  const stepList = resolveProviderCostSteps( {
    steps: Array.isArray( steps ) ? steps : [],
    response
  } );

  const stepCosts = stepList
    .map( step => {
      try {
        return extractor( step?.providerMetadata );
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
