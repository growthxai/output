export const ACTIVITY_GET_TRACE_DESTINATIONS = '__internal#getTraceDestinations';
export const ACTIVITY_OPTIONS_FILENAME = '__activity_options.js';
export const ACTIVITY_SEND_HTTP_REQUEST = '__internal#sendHttpRequest';
export const ACTIVITY_LOGGER_SYMBOL = Symbol.for( '__activity_logger' );
export const METADATA_ACCESS_SYMBOL = Symbol( '__metadata' );
export const WORKFLOW_CATALOG = '$catalog';
export const WORKFLOWS_INDEX_FILENAME = '__workflows_entrypoint.js';

export const INVOKE_ACTIVITY_SYMBOL = Symbol.for( '@outputai/core:__invoke_activity' );

export const ComponentType = {
  EVALUATOR: 'evaluator',
  INTERNAL_STEP: 'internal_step',
  STEP: 'step',
  WORKFLOW: 'workflow'
};

export const LifecycleEvent = {
  START: 'start',
  END: 'end',
  ERROR: 'error'
};

export const BusEventType = {
  WORKER_BEFORE_START: 'worker:before_start',

  WORKFLOW_END: 'workflow:end',
  WORKFLOW_ERROR: 'workflow:error',
  WORKFLOW_LOG: 'workflow:log',
  WORKFLOW_START: 'workflow:start',

  ACTIVITY_END: 'activity:end',
  ACTIVITY_ERROR: 'activity:error',
  ACTIVITY_LOG: 'activity:log',
  ACTIVITY_START: 'activity:start',

  RUNTIME_ERROR: 'runtime_error'
};

export const WorkflowSpecialOutput = {
  CONTINUED_AS_NEW: '<<continued_as_new>>'
};

export const ActivitySpecialOutput = {
  ASYNC_HANDOFF: '<<async_handoff>>'
};
