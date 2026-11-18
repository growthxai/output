import { describe, expect, it } from 'vitest';
import type { Workflow } from '#api/generated/api.js';
import { buildVisibleWorkflows } from './workflows_panel.js';

const workflow = ( overrides: Partial<Workflow> ): Workflow => ( {
  name: 'demo',
  description: 'Demo workflow',
  aliases: [],
  ...overrides
} as Workflow );

describe( 'buildVisibleWorkflows', () => {
  it( 'sorts workflows by name', () => {
    const visible = buildVisibleWorkflows( [
      workflow( { name: 'zebra' } ),
      workflow( { name: 'apple' } ),
      workflow( { name: 'middle' } )
    ], '' );

    expect( visible.map( w => w.name ) ).toEqual( [ 'apple', 'middle', 'zebra' ] );
  } );

  it( 'filters by name, description, and aliases', () => {
    const workflows = [
      workflow( { name: 'invoice', description: 'Billing workflow', aliases: [ 'money' ] } ),
      workflow( { name: 'support', description: 'Ticket triage', aliases: [ 'helpdesk' ] } )
    ];

    expect( buildVisibleWorkflows( workflows, 'invoice' ).map( w => w.name ) ).toEqual( [ 'invoice' ] );
    expect( buildVisibleWorkflows( workflows, 'ticket' ).map( w => w.name ) ).toEqual( [ 'support' ] );
    expect( buildVisibleWorkflows( workflows, 'money' ).map( w => w.name ) ).toEqual( [ 'invoice' ] );
  } );

  it( 'matches queries case-insensitively', () => {
    const visible = buildVisibleWorkflows( [
      workflow( { name: 'Invoice' } ),
      workflow( { name: 'Support' } )
    ], 'invoice' );

    expect( visible.map( w => w.name ) ).toEqual( [ 'Invoice' ] );
  } );

  it( 'returns an empty list when no workflow matches', () => {
    expect( buildVisibleWorkflows( [
      workflow( { name: 'invoice' } )
    ], 'missing' ) ).toEqual( [] );
  } );
} );
