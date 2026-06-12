import { describe, it, expect } from 'vitest';
import { formatWorkflowResult } from './format_workflow_result.js';
import { formatOutput } from './output_formatter.js';

describe( 'formatWorkflowResult', () => {
  it( 'should display output for completed workflows', () => {
    const result = formatWorkflowResult( {
      workflowId: 'wf-123',
      status: 'completed',
      output: { values: [ 1, 2, 3 ] },
      error: null
    } );

    expect( result ).toContain( 'Workflow ID: wf-123' );
    expect( result ).toContain( 'Output:' );
    expect( result ).toContain( '"values"' );
    expect( result ).not.toContain( 'Status:' );
  } );

  it( 'should display error details for failed workflows', () => {
    const result = formatWorkflowResult( {
      workflowId: 'wf-456',
      status: 'failed',
      output: null,
      error: 'Activity task failed'
    } );

    expect( result ).toContain( 'Workflow ID: wf-456' );
    expect( result ).toContain( 'Status: failed' );
    expect( result ).toContain( 'Error: Activity task failed' );
    expect( result ).not.toContain( 'Output:' );
  } );

  it( 'should display status for terminated workflows', () => {
    const result = formatWorkflowResult( {
      workflowId: 'wf-term',
      status: 'terminated',
      output: null,
      error: 'Workflow terminated by user'
    } );

    expect( result ).toContain( 'Status: terminated' );
    expect( result ).toContain( 'Error: Workflow terminated by user' );
  } );

  it( 'should display status for canceled workflows', () => {
    const result = formatWorkflowResult( {
      workflowId: 'wf-cancel',
      status: 'canceled',
      output: null,
      error: 'Workflow was canceled'
    } );

    expect( result ).toContain( 'Status: canceled' );
    expect( result ).toContain( 'Error: Workflow was canceled' );
  } );

  it( 'should display status without error line for continued workflows', () => {
    const result = formatWorkflowResult( {
      workflowId: 'wf-cont',
      status: 'continued',
      output: null,
      error: null
    } );

    expect( result ).toContain( 'Status: continued' );
    expect( result ).not.toContain( 'Error:' );
  } );

  it( 'should omit error line when error is null on failed workflow', () => {
    const result = formatWorkflowResult( {
      workflowId: 'wf-789',
      status: 'failed',
      output: null,
      error: null
    } );

    expect( result ).toContain( 'Status: failed' );
    expect( result ).not.toContain( 'Error:' );
  } );

  it( 'should work with formatOutput for json format', () => {
    const data = {
      workflowId: 'wf-456',
      status: 'failed' as const,
      output: null,
      error: 'Activity task failed'
    };

    const output = formatOutput( data, 'json', formatWorkflowResult );
    const parsed = JSON.parse( output );
    expect( parsed.status ).toBe( 'failed' );
    expect( parsed.error ).toBe( 'Activity task failed' );
  } );
} );
