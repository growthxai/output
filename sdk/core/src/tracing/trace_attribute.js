import Decimal from 'decimal.js';

/**
 * All attributes inherit from this
 */
export class BaseAttribute {
  type;

  constructor( type ) {
    this.type = type;
  }
}

class HTTPRequestCount extends BaseAttribute {
  static TYPE = 'http:request:count';
  url;
  requestId;

  constructor( url, requestId ) {
    super( HTTPRequestCount.TYPE );
    this.url = url;
    this.requestId = requestId;
  }
}

class HTTPRequestCost extends BaseAttribute {
  static TYPE = 'http:request:cost';
  url;
  requestId;
  total = 0;

  constructor( url, requestId, total ) {
    super( HTTPRequestCost.TYPE );
    this.url = url;
    this.requestId = requestId;
    this.total = total;
  }
}

class LLMUsage extends BaseAttribute {
  static TYPE = 'llm:usage';
  modelId;
  usage = [];
  total = 0;
  tokensUsed = 0;

  constructor( modelId ) {
    super( LLMUsage.TYPE );
    this.modelId = modelId;
  }

  addUsage( { type, ppm, amount } ) {
    const total = Decimal( amount ).div( 1_000_000 ).mul( ppm ).toNumber();
    this.usage.push( {
      type,
      ppm,
      amount,
      total
    } );
    this.total = Decimal( this.total ).add( total ).toNumber();
    this.tokensUsed = Decimal( this.tokensUsed ).add( amount ).toNumber();
  }
}

/**
 * Types of ADD_ATTR attributes
 */
export const Attribute = {
  LLMUsage,
  HTTPRequestCost,
  HTTPRequestCount
};
