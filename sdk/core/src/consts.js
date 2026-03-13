export const ACTIVITY_GET_TRACE_DESTINATIONS = '__internal#getTraceDestinations';
export const ACTIVITY_OPTIONS_FILENAME = '__activity_options.js';
export const ACTIVITY_SEND_HTTP_REQUEST = '__internal#sendHttpRequest';
export const METADATA_ACCESS_SYMBOL = Symbol( '__metadata' );
export const SHARED_STEP_PREFIX = '$shared';
export const WORKFLOW_CATALOG = '$catalog';
export const WORKFLOWS_INDEX_FILENAME = '__workflows_entrypoint.js';

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
  WORKFLOW_START: 'workflow:start',
  WORKFLOW_END: 'workflow:end',
  WORKFLOW_ERROR: 'workflow:error',

  ACTIVITY_START: 'activity:start',
  ACTIVITY_END: 'activity:end',
  ACTIVITY_ERROR: 'activity:error',

  RUNTIME_ERROR: 'runtime_error'
};
