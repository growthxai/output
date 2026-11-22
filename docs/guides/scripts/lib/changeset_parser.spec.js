import { describe, expect, it } from 'vitest';
import { parseChangeset, parseFrontmatter } from './changeset_parser.mjs';

describe( 'parseFrontmatter', () => {
  it( 'parses double-quoted package names', () => {
    expect( parseFrontmatter( '"@outputai/cli": patch\n' ) ).toEqual( [
      { name: '@outputai/cli', bump: 'patch' }
    ] );
  } );

  it( 'parses single-quoted package names', () => {
    expect( parseFrontmatter( "'@outputai/cli': patch\n" ) ).toEqual( [
      { name: '@outputai/cli', bump: 'patch' }
    ] );
  } );

  it( 'parses mixed quote styles across lines', () => {
    expect( parseFrontmatter( '"@outputai/core": minor\n\'@outputai/cli\': patch\n' ) ).toEqual( [
      { name: '@outputai/core', bump: 'minor' },
      { name: '@outputai/cli', bump: 'patch' }
    ] );
  } );
} );

describe( 'parseChangeset', () => {
  it( 'parses a single-quoted changeset body', () => {
    const raw = [
      '---',
      "'@outputai/cli': patch",
      '---',
      '',
      'Fixed workflow debug.'
    ].join( '\n' );

    expect( parseChangeset( raw ) ).toEqual( {
      packages: [ { name: '@outputai/cli', bump: 'patch' } ],
      summary: 'Fixed workflow debug.'
    } );
  } );
} );
