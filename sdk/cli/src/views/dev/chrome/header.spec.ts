import { describe, expect, it } from 'vitest';
import { compressPixels } from './header.js';

describe( 'compressPixels', () => {
  it( 'returns an empty array for empty input', () => {
    expect( compressPixels( [] ) ).toEqual( [] );
  } );

  it( 'compresses a 2x2 full block to a single full block', () => {
    expect( compressPixels( [ '██', '██' ] ) ).toEqual( [ '█' ] );
  } );

  it( 'maps each quadrant character correctly', () => {
    // Each row pair decodes to: top-left, top-right, bottom-left, bottom-right
    const cases: Array<[ string[], string ]> = [
      [ [ '  ', '  ' ], ' ' ], // 0000
      [ [ '  ', ' █' ], '▗' ], // 0001 bottom-right
      [ [ '  ', '█ ' ], '▖' ], // 0010 bottom-left
      [ [ '  ', '██' ], '▄' ], // 0011 bottom half
      [ [ ' █', '  ' ], '▝' ], // 0100 top-right
      [ [ ' █', ' █' ], '▐' ], // 0101 right half
      [ [ ' █', '█ ' ], '▞' ], // 0110 anti-diagonal
      [ [ ' █', '██' ], '▟' ], // 0111
      [ [ '█ ', '  ' ], '▘' ], // 1000 top-left
      [ [ '█ ', ' █' ], '▚' ], // 1001 diagonal
      [ [ '█ ', '█ ' ], '▌' ], // 1010 left half
      [ [ '█ ', '██' ], '▙' ], // 1011
      [ [ '██', '  ' ], '▀' ], // 1100 top half
      [ [ '██', ' █' ], '▜' ], // 1101
      [ [ '██', '█ ' ], '▛' ], // 1110
      [ [ '██', '██' ], '█' ] // 1111 full
    ];
    for ( const [ input, expected ] of cases ) {
      expect( compressPixels( input ) ).toEqual( [ expected ] );
    }
  } );

  it( 'pads odd-length rows with an empty bottom row', () => {
    // Single row of 4 cols compresses to 1 row of 2 cols
    expect( compressPixels( [ '████' ] ) ).toEqual( [ '▀▀' ] );
  } );

  it( 'pads odd-width columns with a trailing space', () => {
    // 3 cols compresses to 2 cols (even-padded)
    expect( compressPixels( [ '███', '███' ] ) ).toEqual( [ '█▌' ] );
  } );

  it( 'compresses 5-row input to 3 rows', () => {
    const five = [ '██', '██', '██', '██', '██' ];
    const result = compressPixels( five );
    expect( result.length ).toBe( 3 );
    expect( result[0] ).toBe( '█' );
    expect( result[1] ).toBe( '█' );
    expect( result[2] ).toBe( '▀' );
  } );
} );
