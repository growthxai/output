import { ComponentType, METADATA_ACCESS_SYMBOL } from '#consts';
import { assignImmutableProperty } from './object.js';

const createComponent = ( { handler, ...metadata } ) => {
  assignImmutableProperty( handler, METADATA_ACCESS_SYMBOL, metadata );
  return handler;
};

export const createStep = options => createComponent( { ...options, type: ComponentType.STEP } );
export const createInternalStep = options => createComponent( { ...options, type: ComponentType.INTERNAL_STEP } );
export const createEvaluator = options => createComponent( { ...options, type: ComponentType.EVALUATOR } );
export const createWorkflow = options => createComponent( { ...options, type: ComponentType.WORKFLOW } );
