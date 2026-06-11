import { describe, it, expect } from 'vitest';
import { parseAttributes, tokenizeBlocks, BLOCK_ROLES } from './blocks.js';

describe( 'parseAttributes', () => {
  it( 'parses a bare attribute as boolean true', () => {
    expect( parseAttributes( 'pinned' ) ).toEqual( { pinned: true } );
  } );

  it( 'parses double- and single-quoted values', () => {
    expect( parseAttributes( 'ttl="1h" mode=\'fast\'' ) ).toEqual( { ttl: '1h', mode: 'fast' } );
  } );

  it( 'parses unquoted values', () => {
    expect( parseAttributes( 'ttl=1h' ) ).toEqual( { ttl: '1h' } );
  } );

  it( 'parses multiple attributes and preserves spaces inside quotes', () => {
    expect( parseAttributes( 'pinned options="cached fast"' ) ).toEqual( {
      pinned: true,
      options: 'cached fast'
    } );
  } );

  it( 'returns an empty object for blank input', () => {
    expect( parseAttributes( '' ) ).toEqual( {} );
    expect( parseAttributes() ).toEqual( {} );
  } );
} );

describe( 'tokenizeBlocks', () => {
  it( 'tokenizes plain blocks without an attributes key', () => {
    const blocks = tokenizeBlocks( '<system>Hi</system>\n<user>Yo</user>' );
    expect( blocks ).toEqual( [
      { role: 'system', content: 'Hi' },
      { role: 'user', content: 'Yo' }
    ] );
  } );

  it( 'attaches parsed attributes to the block', () => {
    const blocks = tokenizeBlocks( '<system options="a b" pinned>Hi</system>' );
    expect( blocks[0] ).toEqual( {
      role: 'system',
      content: 'Hi',
      attributes: { options: 'a b', pinned: true }
    } );
  } );

  it( 'captures unknown attributes generically (validation rejects them later)', () => {
    const blocks = tokenizeBlocks( '<user data="x">Hi</user>' );
    expect( blocks[0].attributes ).toEqual( { data: 'x' } );
  } );

  it( 'treats angle-bracket markup inside a block as opaque content', () => {
    const blocks = tokenizeBlocks( '<user>Compare <div> and <span> tags</user>' );
    expect( blocks[0] ).toEqual( { role: 'user', content: 'Compare <div> and <span> tags' } );
  } );

  it( 'tokenizes every registered role', () => {
    const body = [ ...BLOCK_ROLES ].map( role => `<${role}>${role} body</${role}>` ).join( '\n' );
    const blocks = tokenizeBlocks( body );
    expect( blocks.map( block => block.role ) ).toEqual( [ ...BLOCK_ROLES ] );
  } );
} );
