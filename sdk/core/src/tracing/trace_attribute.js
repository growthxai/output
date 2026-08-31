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

/**
 * Types of ADD_ATTR attributes
 */
export const Attribute = {
  BaseAttribute,
  HTTPRequestCost,
  HTTPRequestCount
};
