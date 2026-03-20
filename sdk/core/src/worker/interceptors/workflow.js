// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { workflowInfo, proxySinks, ApplicationFailure, ContinueAsNew } from '@temporalio/workflow';
import { memoToHeaders } from '../sandboxed_utils.js';
import { deepMerge } from '#utils';
import { METADATA_ACCESS_SYMBOL } from '#consts';
// this is a dynamic generated file with activity configs overwrites
import stepOptions from '../temp/__activity_options.js';

/*
  This is not an AI comment!

  This interceptor adds information value from workflowInfo().memo as Activity invocation headers.

  This is a strategy to share values between the workflow context and activity context.

  We also want to preserve existing headers that might have been inject somewhere else and
*/
class HeadersInjectionInterceptor {
  async scheduleActivity( input, next ) {
    const memo = workflowInfo().memo ?? {};
    Object.assign( input.headers, memoToHeaders( memo ) );
    // apply per-invocation options passed as second argument by rewritten calls
    const options = stepOptions[input.activityType];
    if ( options ) {
      input.options = deepMerge( memo.activityOptions, options );
    }
    return next( input );
  }
};

const sinks = proxySinks();

class WorkflowExecutionInterceptor {
  async execute( input, next ) {
    sinks.workflow.start( input.args[0] );
    try {
      const output = await next( input );
      sinks.workflow.end( output );
      return output;
    } catch ( error ) {
      /*
       * When the error is a ContinueAsNew instance, it represents the point where the actual workflow code was
       * delegated to another run. In this case the result in the traces will be the string below and
       * a new trace file will be generated
       */
      if ( error instanceof ContinueAsNew ) {
        sinks.workflow.end( '<continued_as_new>' );
        throw error;
      }

      sinks.workflow.error( error );
      const failure = new ApplicationFailure( error.message, error.constructor.name, undefined, undefined, error );

      /*
       * If intercepted error has metadata, set it to .details property of Temporal's ApplicationFailure instance.
       * This make it possible for this information be retrieved by Temporal's client instance.
       * Ref: https://typescript.temporal.io/api/classes/common.ApplicationFailure#details
       */
      if ( error[METADATA_ACCESS_SYMBOL] ) {
        failure.details = [ error[METADATA_ACCESS_SYMBOL] ];
      }
      throw failure;
    }
  }
};

export const interceptors = () => ( {
  inbound: [ new WorkflowExecutionInterceptor() ],
  outbound: [ new HeadersInjectionInterceptor() ]
} );
