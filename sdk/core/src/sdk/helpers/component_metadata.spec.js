import { describe, expect, it } from 'vitest';
import { METADATA_ACCESS_SYMBOL } from '#consts';
import { ComponentMetadata } from './component_metadata.js';

describe( 'ComponentMetadata', () => {
  it( 'detects functions tagged with component metadata', () => {
    const component = () => {};
    Object.defineProperty( component, METADATA_ACCESS_SYMBOL, {
      value: { name: 'my_component' }
    } );

    expect( ComponentMetadata.has( component ) ).toBe( true );
  } );

  it( 'returns the component metadata name', () => {
    const component = () => {};
    Object.defineProperty( component, METADATA_ACCESS_SYMBOL, {
      value: { name: 'my_component' }
    } );

    expect( ComponentMetadata.getName( component ) ).toBe( 'my_component' );
  } );

  it( 'returns false and undefined for untagged functions', () => {
    const fn = () => {};

    expect( ComponentMetadata.has( fn ) ).toBe( false );
    expect( ComponentMetadata.getName( fn ) ).toBeUndefined();
  } );
} );
