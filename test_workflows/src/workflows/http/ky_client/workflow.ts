import { workflow, z } from '@outputai/core';
import {
  basicAuthStep,
  bearerAuthFailureStep,
  clientErrorStatusStep,
  compressionStep,
  headersStep,
  jsonStep,
  manualRedirectStep,
  nodeFormDataStep,
  redirectStep,
  serverErrorStatusStep,
  streamStep,
  successStatusStep,
  timeoutStep,
  undiciFormDataStep,
  urlEncodedFormStep
} from './steps.js';

export default workflow( {
  name: 'ky_client',
  description: 'Exercises createKyClient HTTP behaviors',
  outputSchema: z.object( {
    traceHeader: z.string(),
    json: z.object( {
      name: z.string(),
      active: z.boolean()
    } ),
    urlEncodedForm: z.string(),
    nodeFormData: z.string(),
    undiciFormData: z.string(),
    successStatus: z.number(),
    clientErrorStatus: z.number(),
    serverErrorStatus: z.number(),
    timeoutError: z.string(),
    redirectUrl: z.string(),
    manualRedirectStatus: z.number(),
    basicAuthStatus: z.number(),
    bearerAuthFailureStatus: z.number(),
    compressed: z.boolean(),
    streamLines: z.number()
  } ),
  fn: async () => ( {
    traceHeader: await headersStep(),
    json: await jsonStep(),
    urlEncodedForm: await urlEncodedFormStep(),
    nodeFormData: await nodeFormDataStep(),
    undiciFormData: await undiciFormDataStep(),
    successStatus: await successStatusStep(),
    clientErrorStatus: await clientErrorStatusStep(),
    serverErrorStatus: await serverErrorStatusStep(),
    timeoutError: await timeoutStep(),
    redirectUrl: await redirectStep(),
    manualRedirectStatus: await manualRedirectStep(),
    basicAuthStatus: await basicAuthStep(),
    bearerAuthFailureStatus: await bearerAuthFailureStep(),
    compressed: await compressionStep(),
    streamLines: await streamStep()
  } )
} );
