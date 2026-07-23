import { describe, expect, it } from 'vitest';
import { normalizeWorkflowStatus } from './normalize_workflow_status.js';

describe( 'normalizeWorkflowStatus', () => {
  it( 'temporarily maps continued to continued_as_new', () => {
    expect( normalizeWorkflowStatus( 'continued' ) ).toBe( 'continued_as_new' );
  } );

  it( 'maps the previous canceled spelling to cancelled', () => {
    expect( normalizeWorkflowStatus( 'canceled' ) ).toBe( 'cancelled' );
  } );

  it( 'leaves other statuses and nullish values unchanged', () => {
    expect( normalizeWorkflowStatus( 'completed' ) ).toBe( 'completed' );
    expect( normalizeWorkflowStatus( 'continued_as_new' ) ).toBe( 'continued_as_new' );
    expect( normalizeWorkflowStatus( null ) ).toBeNull();
    expect( normalizeWorkflowStatus( undefined ) ).toBeUndefined();
  } );
} );
