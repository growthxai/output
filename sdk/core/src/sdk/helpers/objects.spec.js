import { describe, expect, it } from 'vitest';
import { Objects } from './objects.js';
import { Objects as ObjectsFromIndex } from './index.js';
import { clone, deepMerge, deepMergeWithResolver, isPlainObject } from '#helpers/object';

describe( 'Objects', () => {
  it( 'exports the same functions from the object helper module', () => {
    expect( Objects ).toBe( ObjectsFromIndex );
    expect( Objects ).toEqual( {
      clone,
      deepMerge,
      deepMergeWithResolver,
      isPlainObject
    } );
  } );
} );
