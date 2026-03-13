// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { defineSignal, setHandler, proxyActivities, workflowInfo, proxySinks, uuid4, Trigger } from '@temporalio/workflow';
import { ACTIVITY_SEND_HTTP_REQUEST } from '#consts';
import { FatalError } from '#errors';
import { validateRequestPayload } from './validations/static.js';

/**
 * Call the internal activity to make a HTTP request and returns its response.
 *
 * @param {Object} parameters
 * @param {string} url
 * @param {string} method
 * @param {unknown} [payload]
 * @param {object} [headers]
 * @returns {Promise<object>} The serialized HTTP response
 */
export async function sendHttpRequest( { url, method = 'GET', payload = undefined, headers = undefined } ) {
  validateRequestPayload( { method, url, payload, headers } );
  const res = await proxyActivities( {
    startToCloseTimeout: '3m',
    retry: {
      initialInterval: '15s',
      maximumAttempts: 3,
      nonRetryableErrorTypes: [ FatalError.name ]
    }
  } )[ACTIVITY_SEND_HTTP_REQUEST]( { method, url, payload, headers } );
  return res;
};

/**
 * Call the internal activity to make a POST request sending a payload to a given url.
 *
 * After the request succeeds, pause the code using Trigger and wait for a Signal to un-pause it.
 *
 * The signal will be sent by the API when a response is sent to its webhook url.
 *
 * @param {Object} parameters
 * @param {string} url
 * @param {unknown} [payload]
 * @param {object} [headers]
 * @returns {Promise<unknown>} The response received by the webhook
 */
export async function sendPostRequestAndAwaitWebhook( { url, payload = undefined, headers = undefined } ) {
  const { workflowId } = workflowInfo();
  const wrappedPayload = { workflowId, payload };

  await sendHttpRequest( { method: 'POST', url, payload: wrappedPayload, headers } );

  const sinks = await proxySinks();
  const resumeTrigger = new Trigger();
  const resumeSignal = defineSignal( 'resume' );

  const traceId = `${workflowId}-${url}-${uuid4()}`;
  sinks.trace.start( { id: traceId, name: 'resume', kind: 'webhook' } );

  setHandler( resumeSignal, webhookPayload => {
    if ( !resumeTrigger.resolved ) {
      sinks.trace.end( { id: traceId, details: webhookPayload } );
      resumeTrigger.resolve( webhookPayload );
    }
  } );

  return resumeTrigger;
};
