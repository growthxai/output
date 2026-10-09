/** Payload of the `http:request` event */
export type HttpRequestEvent = {
  requestId: string;
  method: string;
  url: string;
  status: number | undefined;
  durationMs: number;
  outcome: 'success' | 'error' | 'failure';
};

/** Payload of the `cost:http:request` event */
export type HttpRequestCostEvent = {
  type: 'http:request:cost';
  requestId: string;
  url: string;
  total: number;
};

export { outputFetch } from './fetch/index.js';
export { HTTPRequestCount } from './fetch/logger.js';
export { createKyClient } from './ky/index.js';

export { addRequestCost, HTTPRequestCost } from './cost.js';

/** Re-export ky library for convenience. */
export * as ky from 'ky';
export * as undici from 'undici';
