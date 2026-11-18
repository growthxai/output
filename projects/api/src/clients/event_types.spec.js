import { describe, it, expect } from 'vitest';
import pkg from '@temporalio/proto';
import { EventType } from './event_types.js';

const { temporal } = pkg;
const { EventType: protoEventType } = temporal.api.enums.v1;

const protoEntries = Object.entries( protoEventType )
  .filter( ( [ , v ] ) => typeof v === 'number' && v > 0 )
  .map( ( [ k, v ] ) => [ k.replace( 'EVENT_TYPE_', '' ), v ] );

describe( 'EventType', () => {
  it( 'contains every value defined in the Temporal protobuf enum', () => {
    const missing = protoEntries.filter( ( [ name ] ) => !( name in EventType ) ).map( ( [ name ] ) => name );
    const msg = `Missing from EventType (update event_types.js after @temporalio/proto upgrade): ${ missing.join( ', ' ) }`;
    expect( missing, msg ).toHaveLength( 0 );
  } );

  it( 'has no values that conflict with the proto', () => {
    for ( const [ name, value ] of Object.entries( EventType ) ) {
      const protoValue = protoEventType[`EVENT_TYPE_${ name }`];
      expect( protoValue, `EventType.${ name } = ${ value } not found in proto — may be renamed or removed` ).toBe( value );
    }
  } );
} );
