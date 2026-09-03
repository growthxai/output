import Decimal from 'decimal.js';
import { Tracing } from '@outputai/core/sdk/runtime';
import { parseGroundingUsage } from './grounding.js';

const exists = v => Number.isSafeInteger( v ) && v >= 0;

const safeSum = ( ...values ) => values.filter( exists ).reduce( ( t, v ) => t + v, 0 );

export class LLMGenerationUsageItem {
  static Group = { INPUT: 'input', OUTPUT: 'output', REQUEST: 'request' };

  group;
  label;
  amount;

  constructor( group, label, amount ) {
    this.group = group;
    this.label = label;
    this.amount = amount;
  }
}

export class LLMGenerationUsage extends Tracing.Attribute.BaseAttribute {
  static TYPE = 'llm:generation:usage';

  static Status = Object.freeze( {
    COMPLETE: 'complete',
    INCOMPLETE: 'incomplete'
  } );

  providerId;
  modelId;
  status = LLMGenerationUsage.Status.INCOMPLETE;
  input = null;
  output = null;
  total = null;
  items = [];

  constructor( modelId, providerId, items ) {
    super( LLMGenerationUsage.TYPE );
    this.providerId = providerId;
    this.modelId = modelId;
    this.items = items;
    const inputItems = items.filter( p => p.group === LLMGenerationUsageItem.Group.INPUT );
    if ( inputItems.length > 0 ) {
      this.input = inputItems.reduce( ( s, p ) => s.add( p.amount ), Decimal( 0 ) ).toNumber();
    }
    const outputItems = items.filter( p => p.group === LLMGenerationUsageItem.Group.OUTPUT );
    if ( outputItems.length > 0 ) {
      this.output = outputItems.reduce( ( s, p ) => s.add( p.amount ), Decimal( 0 ) ).toNumber();
    }

    if ( exists( this.input ) || exists( this.output ) ) {
      this.total = ( this.input ?? 0 ) + ( this.output ?? 0 );
    }
    this.status = LLMGenerationUsage.Status[exists( this.input ) && exists( this.output ) ? 'COMPLETE' : 'INCOMPLETE'];
  }
}

/**
 * Converts raw AI SDK usage to LLMGenerationUsage data
 *
 * @param {object} args
 * @param {object} args.prompt - Output prompt with model configuration
 * @param {object} args.prompt.config - Prompt model configuration
 * @param {string} args.prompt.config.provider - Id of the provider
 * @param {string} args.prompt.config.model - Id of the model
 * @param {object} args.usage - AI SDK usage with aggregate token counts and optional input/output token details
 * @param {object[]} [args.steps] - AI SDK steps, each with its own `providerMetadata`, used for per-request charges
 *
 * @returns {LLMGenerationUsage | null} LLM generation usage with input, output, total and detailed breakdown
 */
export const parseLLMUsage = ( { prompt, usage, steps } ) => {
  const { provider: providerId, model: modelId } = prompt.config;
  const { inputTokens, inputTokenDetails, outputTokens, outputTokenDetails } = usage;
  const { noCacheTokens, cacheReadTokens, cacheWriteTokens } = inputTokenDetails ?? {};
  const { textTokens, reasoningTokens } = outputTokenDetails ?? {};

  const items = [];

  if ( exists( inputTokens ) ) {
    // the sum of the components must be equal to the tokens
    const useDetails = inputTokens > 0 && safeSum( noCacheTokens, cacheReadTokens, cacheWriteTokens ) === inputTokens;
    const group = LLMGenerationUsageItem.Group.INPUT;

    if ( useDetails ) {
      if ( exists( noCacheTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'no_cache', noCacheTokens ) );
      }
      if ( exists( cacheReadTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'cache_read', cacheReadTokens ) );
      }
      if ( exists( cacheWriteTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'cache_write', cacheWriteTokens ) );
      }
    } else {
      items.push( new LLMGenerationUsageItem( group, null, inputTokens ) );
    }
  }

  if ( exists( outputTokens ) ) {
    // the sum of the components must be equal to the tokens
    const useDetails = outputTokens > 0 && safeSum( textTokens, reasoningTokens ) === outputTokens;
    const group = LLMGenerationUsageItem.Group.OUTPUT;

    if ( useDetails ) {
      if ( exists( textTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'text', textTokens ) );
      }
      if ( exists( reasoningTokens ) ) {
        items.push( new LLMGenerationUsageItem( group, 'reasoning', reasoningTokens ) );
      }
    } else {
      items.push( new LLMGenerationUsageItem( group, null, outputTokens ) );
    }
  }

  // Grounding is billed per step, so aggregate across every step rather than only the final one.
  // Per-query families (Gemini 3) return queries.length per step; per-prompt families (Gemini 2.x)
  // return 1 per grounded step. Summing yields total queries and grounded-step count respectively.
  const grounding = ( steps ?? [] )
    .filter( step => step?.providerMetadata )
    .map( step => parseGroundingUsage( modelId, step.providerMetadata ) )
    .filter( Boolean );
  if ( grounding.length > 0 ) {
    const amount = grounding.reduce( ( sum, g ) => sum + g.amount, 0 );
    items.push( new LLMGenerationUsageItem( LLMGenerationUsageItem.Group.REQUEST, grounding[0].label, amount ) );
  }

  if ( items.length === 0 ) {
    return null;
  }

  return new LLMGenerationUsage( modelId, providerId, items );
};
