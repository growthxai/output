import { describe, expect, it } from 'vitest';
import { buildEntries, validateScenarioName } from './run_modal.js';

describe( 'buildEntries', () => {
  it( 'lists scenarios then the custom-JSON entry', () => {
    const entries = buildEntries( [ 'basic', 'edge' ] );
    expect( entries.map( e => e.label ) ).toEqual( [ 'basic', 'edge', '[Run custom JSON]' ] );
    expect( entries[0] ).toMatchObject( { kind: 'scenario', scenarioName: 'basic' } );
    expect( entries.at( -1 ) ).toMatchObject( { kind: 'custom' } );
  } );

  it( 'offers the custom entry even with no saved scenarios', () => {
    const entries = buildEntries( [] );
    expect( entries ).toHaveLength( 1 );
    expect( entries[0].kind ).toBe( 'custom' );
  } );
} );

describe( 'validateScenarioName', () => {
  it( 'rejects empty or whitespace-only names', () => {
    expect( validateScenarioName( '', [] ) ).toMatch( /cannot be empty/ );
    expect( validateScenarioName( '   ', [] ) ).toMatch( /cannot be empty/ );
  } );

  it( 'rejects names with unsupported characters', () => {
    expect( validateScenarioName( 'has space', [] ) ).toMatch( /letters, numbers/ );
    expect( validateScenarioName( 'bad/name', [] ) ).toMatch( /letters, numbers/ );
  } );

  it( 'rejects names that already exist', () => {
    expect( validateScenarioName( 'basic', [ 'basic' ] ) ).toMatch( /already exists/ );
  } );

  it( 'trims before checking for duplicates', () => {
    expect( validateScenarioName( '  basic  ', [ 'basic' ] ) ).toMatch( /already exists/ );
  } );

  it( 'accepts a unique name with allowed characters', () => {
    expect( validateScenarioName( 'edge_case-1', [ 'basic' ] ) ).toBeNull();
  } );
} );
