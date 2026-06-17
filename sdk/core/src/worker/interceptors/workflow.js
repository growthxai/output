// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { workflowInfo, proxySinks, ContinueAsNew, isCancellation } from '@temporalio/workflow';
import { memoToHeaders } from './headers.js';
import { deepMerge } from '#utils';
import { buildApplicationFailureWithDetails } from '#internal_utils/errors';
import { METADATA_ACCESS_SYMBOL, WorkflowSpecialOutput } from '#consts';
import { createWorkflowDetails } from '#internal_utils/temporal_context';

// this is a dynamic generated file with activity configs overwrites
import stepOptions from '../temp/__activity_options.js';

/*
  This interceptor adds Memo and serialized workflowInfo() to the Activity invocation headers.
  This is a strategy to share values between the workflow context and activity context.
  We also want to preserve existing headers that might have been inject somewhere else.
*/
class HeadersInjectionInterceptor {
  async scheduleActivity( input, next ) {
    const info = workflowInfo();
    const memo = info.memo ?? {};
    Object.assign( input.headers, memoToHeaders( {
      ...memo,
      workflowDetails: createWorkflowDetails( info )
    } ) );
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
        sinks.workflow.end( WorkflowSpecialOutput.CONTINUED_AS_NEW );
        throw error;
      }

      if ( isCancellation( error ) ) {
        sinks.workflow.error( error );
        throw error;
      }

      sinks.workflow.error( error );

      /*
       * Add internal error .details to Temporal's ApplicationFailure .details
       * This make it possible for this information be retrieved by Temporal's client instance.
       * Ref: https://typescript.temporal.io/api/classes/common.ApplicationFailure#details
       */
      throw error[METADATA_ACCESS_SYMBOL] ? buildApplicationFailureWithDetails( error, error[METADATA_ACCESS_SYMBOL] ) : error;
    }
  }
};

export const interceptors = () => ( {
  inbound: [ new WorkflowExecutionInterceptor() ],
  outbound: [ new HeadersInjectionInterceptor() ]
} );
