export declare namespace Attribute {
  export interface Usage {
    type: string;
    ppm: number;
    amount: number;
    total: number;
  }

  export class HTTPRequestCount {
    static TYPE: 'http:request:count';
    type: typeof HTTPRequestCount.TYPE;
    url: string;
    requestId: string;
    constructor( url: string, requestId: string );
  }

  export class HTTPRequestCost {
    static TYPE: 'http:request:cost';
    type: typeof HTTPRequestCost.TYPE;
    url: string;
    requestId: string;
    total: number;
    constructor( url: string, requestId: string, total: number );
  }

  export class LLMUsage {
    static TYPE: 'llm:usage';
    type: typeof LLMUsage.TYPE;
    modelId: string;
    usage: Usage[];
    constructor( modelId: string );
    addUsage( usage: { type: string; ppm: number; amount: number } ): void;
    readonly total: number;
    readonly tokensUsed: number;
  }

  export type Instance = HTTPRequestCount | HTTPRequestCost | LLMUsage;
}
