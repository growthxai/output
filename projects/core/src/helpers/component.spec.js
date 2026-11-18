import { describe, it, expect } from 'vitest';
import { ComponentType, METADATA_ACCESS_SYMBOL } from '#consts';
import { createEvaluator, createInternalStep, createStep, createWorkflow } from './component.js';

const factories = [
  [ 'createStep', createStep, ComponentType.STEP ],
  [ 'createInternalStep', createInternalStep, ComponentType.INTERNAL_STEP ],
  [ 'createEvaluator', createEvaluator, ComponentType.EVALUATOR ],
  [ 'createWorkflow', createWorkflow, ComponentType.WORKFLOW ]
];

describe( 'component helpers', () => {
  it.each( factories )( '%s returns the handler with typed metadata', ( _, create, type ) => {
    const handler = () => 'ok';
    const inputSchema = { safeParse: () => ( { success: true } ) };
    const outputSchema = { safeParse: () => ( { success: true } ) };
    const options = { activityOptions: { startToCloseTimeout: '1m' } };

    const component = create( {
      name: 'test_component',
      description: 'Test component',
      inputSchema,
      outputSchema,
      handler,
      options
    } );

    expect( component ).toBe( handler );
    expect( component[METADATA_ACCESS_SYMBOL] ).toEqual( {
      name: 'test_component',
      description: 'Test component',
      inputSchema,
      outputSchema,
      options,
      type
    } );
  } );

  it( 'defines metadata as a hidden immutable property', () => {
    const handler = () => {};
    const component = createStep( { name: 'hidden_step', handler } );

    expect( Object.getOwnPropertyDescriptor( component, METADATA_ACCESS_SYMBOL ) ).toEqual( {
      value: { name: 'hidden_step', type: ComponentType.STEP },
      writable: false,
      configurable: false,
      enumerable: false
    } );
    expect( Object.keys( component ) ).toEqual( [] );
    expect( () => {
      component[METADATA_ACCESS_SYMBOL] = { name: 'updated' };
    } ).toThrow( TypeError );
  } );
} );
