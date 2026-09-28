import { describe, it, expect } from 'vitest';
import { serializeSearchAttributes, inheritableSearchAttributes } from './search_attributes.js';

describe( 'serializeSearchAttributes', () => {
  it( 'returns undefined for absent input', () => {
    expect( serializeSearchAttributes( undefined ) ).toBeUndefined();
    expect( serializeSearchAttributes( null ) ).toBeUndefined();
  } );

  it( 'converts Date values to ISO strings', () => {
    const date = new Date( '2026-06-02T09:00:00.000Z' );

    expect( serializeSearchAttributes( { ScheduledAt: [ date ] } ) ).toEqual( { ScheduledAt: [ '2026-06-02T09:00:00.000Z' ] } );
  } );

  it( 'passes through arrays of each scalar type', () => {
    const searchAttributes = {
      CustomerId: [ 'cust-1' ],
      Tags: [ 'a', 'b' ],
      Priority: [ 3 ],
      Score: [ 0.5 ],
      IsTest: [ true ],
      Empty: []
    };

    expect( serializeSearchAttributes( searchAttributes ) ).toEqual( searchAttributes );
  } );

  it( 'does not mutate the input', () => {
    const date = new Date( '2026-06-02T09:00:00.000Z' );
    const values = [ date ];
    const searchAttributes = { ScheduledAt: values, CustomerId: [ 'cust-1' ] };

    const result = serializeSearchAttributes( searchAttributes );

    expect( result ).not.toBe( searchAttributes );
    expect( result.ScheduledAt ).not.toBe( values );
    expect( searchAttributes ).toEqual( { ScheduledAt: [ date ], CustomerId: [ 'cust-1' ] } );
    expect( values[0] ).toBe( date );
  } );
} );

describe( 'inheritableSearchAttributes', () => {
  it( 'returns undefined for absent input', () => {
    expect( inheritableSearchAttributes( undefined ) ).toBeUndefined();
    expect( inheritableSearchAttributes( null ) ).toBeUndefined();
  } );

  it( 'keeps custom attributes and drops Temporal system attributes', () => {
    const searchAttributes = {
      ClientId: [ 'client-1' ],
      Tags: [ 'a', 'b' ],
      TemporalScheduledById: [ 'schedule-1' ],
      TemporalScheduledStartTime: [ new Date( '2026-06-02T09:00:00.000Z' ) ],
      TemporalChangeVersion: [ 'patch-1' ],
      BuildIds: [ 'unversioned' ]
    };

    expect( inheritableSearchAttributes( searchAttributes ) ).toEqual( { ClientId: [ 'client-1' ], Tags: [ 'a', 'b' ] } );
  } );

  it( 'keeps Date values raw', () => {
    const date = new Date( '2026-06-02T09:00:00.000Z' );

    const result = inheritableSearchAttributes( { ScheduledAt: [ date ] } );

    expect( result.ScheduledAt[0] ).toBe( date );
  } );

  it( 'returns undefined when only system attributes remain', () => {
    expect( inheritableSearchAttributes( { TemporalScheduledById: [ 'schedule-1' ], BuildIds: [ 'unversioned' ] } ) ).toBeUndefined();
    expect( inheritableSearchAttributes( {} ) ).toBeUndefined();
  } );

  it( 'does not mutate the input', () => {
    const searchAttributes = { ClientId: [ 'client-1' ], TemporalScheduledById: [ 'schedule-1' ] };

    const result = inheritableSearchAttributes( searchAttributes );

    expect( result ).not.toBe( searchAttributes );
    expect( searchAttributes ).toEqual( { ClientId: [ 'client-1' ], TemporalScheduledById: [ 'schedule-1' ] } );
  } );
} );
