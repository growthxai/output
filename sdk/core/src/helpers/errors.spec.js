import { describe, expect, it } from 'vitest';
import { inheritsFromAnyNamedType } from './errors.js';

describe( 'inheritsFromAnyNamedType', () => {
  class BaseFailure extends Error {}
  class DomainFailure extends BaseFailure {}
  class RequestFailure extends DomainFailure {}
  class UnrelatedFailure extends Error {}

  it( 'matches exact, parent, and grandparent constructor names', () => {
    const error = new RequestFailure( 'request failed' );

    expect( inheritsFromAnyNamedType( error, [ 'RequestFailure' ] ) ).toBe( true );
    expect( inheritsFromAnyNamedType( error, [ 'DomainFailure' ] ) ).toBe( true );
    expect( inheritsFromAnyNamedType( error, [ 'BaseFailure' ] ) ).toBe( true );
    expect( inheritsFromAnyNamedType( error, [ 'OtherFailure', 'BaseFailure' ] ) ).toBe( true );
  } );

  it( 'does not match unrelated or descendant constructor names', () => {
    expect( inheritsFromAnyNamedType( new RequestFailure(), [ 'UnrelatedFailure' ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( new BaseFailure(), [ 'RequestFailure' ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( new UnrelatedFailure(), [ 'BaseFailure' ] ) ).toBe( false );
  } );

  it( 'ignores a spoofed own constructor property', () => {
    const error = new RequestFailure();
    Object.defineProperty( error, 'constructor', {
      value: { name: 'SpoofedFailure' }
    } );

    expect( inheritsFromAnyNamedType( error, [ 'SpoofedFailure' ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( error, [ 'RequestFailure' ] ) ).toBe( true );
  } );

  it( 'rejects empty names and invalid values without false positives', () => {
    const unnamedConstructor = function NamedConstructor() {};
    Object.defineProperty( unnamedConstructor, 'name', { value: '' } );
    const value = Object.create( { constructor: unnamedConstructor } );

    expect( inheritsFromAnyNamedType( value, [ '', undefined ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( value, [] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( null, [ 'BaseFailure' ] ) ).toBe( false );
    expect( inheritsFromAnyNamedType( 'failure', [ 'String' ] ) ).toBe( false );
  } );
} );
