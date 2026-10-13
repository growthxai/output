import type { KyResponse } from 'ky';
import { Attribute } from '#trace_attribute';

/** Trace attribute (`http:request:cost`) holding the cost attached to an HTTP request with `addRequestCost` */
export declare class HTTPRequestCost extends Attribute.BaseAttribute {
  static TYPE: 'http:request:cost';
  type: typeof HTTPRequestCost.TYPE;
  url: string;
  requestId: string;
  total: number;
  constructor( url: string, requestId: string, total: number );
}

/**
 * Attach cost information to the trace of an HTTP Request using the response
 *
 * @param response - The response of the HTTP Request to attach the information
 * @param value - The price of the HTTP request
 */
export declare function addRequestCost( response: KyResponse | Response, value: number ): void;
