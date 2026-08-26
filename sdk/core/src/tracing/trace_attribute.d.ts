export declare namespace Attribute {
  export class BaseAttribute {
    type: string;
    constructor( type: string );
  }

  export class HTTPRequestCount extends BaseAttribute {
    static TYPE: 'http:request:count';
    type: typeof HTTPRequestCount.TYPE;
    url: string;
    requestId: string;
    constructor( url: string, requestId: string );
  }

  export class HTTPRequestCost extends BaseAttribute {
    static TYPE: 'http:request:cost';
    type: typeof HTTPRequestCost.TYPE;
    url: string;
    requestId: string;
    total: number;
    constructor( url: string, requestId: string, total: number );
  }

  export type Instance = BaseAttribute;
}
