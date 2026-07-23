// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { workflowInfo, proxySinks, ContinueAsNew, isCancellation, ApplicationFailure, TemporalFailure } from '@temporalio/workflow';
import { memoToHeaders } from './headers.js';
import { deepMerge } from '#helpers/object';
import { WorkflowSpecialOutput } from '#consts';
import { createWorkflowDetails } from '#helpers/temporal_context';

// this is a dynamic generated file with activity configs overwrites
import activityOptionsMap from '../temp/__activity_options.js';
import { FatalError, ValidationError } from '#errors';
import { serializeError } from '#helpers/errors';

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
    // Apply component-level activity options on top of workflow options.
    const activityOptionsOverrides = activityOptionsMap[input.activityType];
    if ( activityOptionsOverrides ) {
      input.options = deepMerge( input.options ?? {}, activityOptionsOverrides );
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

      /**
       * We send serialized error to the sink, because temporal loses Error meta-information, like name, type, etc
       * when crossing the workflow sandbox barrier. The plain object doesn't lose anything.
       */
      /**
       * This happens when the workflow is cancelled.
       * Re-throw the error as it is.
       * Sink back the error without stack (not necessary for this) and without `.failure` because it
       * contains Temporal’s large internal protobuf representation and duplicates the useful error details.
       */
      if ( isCancellation( error ) ) {
        sinks.workflow.error( serializeError( error, { includeStack: false, excludeProps: [ 'failure' ] } ) );
        throw error;
      }

      /**
       * This represents an error in the workflow itself, in this case the sink receives the error serialize with stack
       * An Application failure is constructed to finish the workflow run and the serialized error is added to its details
       * so the API or other consumers can read it. Stack is omitted
       */
      if ( [ FatalError, ValidationError ].some( E => error instanceof E ) ) {
        sinks.workflow.error( serializeError( error ) );
        throw ApplicationFailure.fromError( error, {
          cause: error,
          nonRetryable: true,
          details: [ { error: serializeError( error, { includeStack: false } ) } ]
        } );
      };

      /**
       * This is mostly likely an error in one Activity (or other Temporal parts)
       * Re-throw as it is and sink back the error without failure, for the same reason as in cancellation.
       */
      if ( error instanceof TemporalFailure ) {
        sinks.workflow.error( serializeError( error, { excludeProps: [ 'failure' ] } ) );
        throw error;
      }

      // Workflow Task failure, do not sink as this retry the Task no the Workflow
      throw error;
    }
  }
};

export const interceptors = () => ( {
  inbound: [ new WorkflowExecutionInterceptor() ],
  outbound: [ new HeadersInjectionInterceptor() ]
} );
