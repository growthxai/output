import Decimal from 'decimal.js';
import { isNonNegativeInteger } from '#helpers/number';
import { LLMGeneration } from './llm_generation.js';

export class LLMGenerationUsageItem {
  static Group = { INPUT: 'input', OUTPUT: 'output', TOOLS: 'tools' };

  group;
  label;
  amount;

  constructor( group, label, amount ) {
    this.group = group;
    this.label = label;
    this.amount = amount;
  }
}

export class LLMGenerationUsage extends LLMGeneration {
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

  constructor( modelId, providerId, promptName, requestDetails, items ) {

    super( LLMGenerationUsage.TYPE, modelId, providerId, promptName, requestDetails );
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

    if ( isNonNegativeInteger( this.input ) || isNonNegativeInteger( this.output ) ) {
      this.total = ( this.input ?? 0 ) + ( this.output ?? 0 );
    }
    this.status = LLMGenerationUsage.Status[isNonNegativeInteger( this.input ) && isNonNegativeInteger( this.output ) ? 'COMPLETE' : 'INCOMPLETE'];
  }
}
