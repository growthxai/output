import { Attribute } from '#trace_attribute';

/** Trace attribute (`http:request:count`) added to every HTTP request made with `outputFetch` or `createKyClient` */
export declare class HTTPRequestCount extends Attribute.BaseAttribute {
  static TYPE: 'http:request:count';
  type: typeof HTTPRequestCount.TYPE;
  url: string;
  requestId: string;
  constructor( url: string, requestId: string );
}
