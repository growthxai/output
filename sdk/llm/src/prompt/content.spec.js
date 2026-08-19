import { describe, it, expect } from 'vitest';
import { Role } from '../consts.js';
import { parseAttributes, extractMessages, parseContent } from './content.js';

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

describe( 'extractMessages', () => {
  it( 'extracts plain messages without an attributes key', () => {
    expect( extractMessages( '<system>Hi</system>\n<user>Yo</user>' ) ).toEqual( [
      { role: Role.SYSTEM, content: 'Hi' },
      { role: Role.USER, content: 'Yo' }
    ] );
  } );

  it( 'attaches parsed attributes to the message', () => {
    expect( extractMessages( '<system options="a b" pinned>Hi</system>' ) ).toEqual( [ {
      role: Role.SYSTEM,
      content: 'Hi',
      attributes: { options: 'a b', pinned: true }
    } ] );
  } );

  it( 'captures unknown attributes generically (validation rejects them later)', () => {
    expect( extractMessages( '<user data="x">Hi</user>' )[0].attributes ).toEqual( { data: 'x' } );
  } );

  it( 'treats angle-bracket markup inside a message as opaque content', () => {
    expect( extractMessages( '<user>Compare <div> and <span> tags</user>' ) ).toEqual( [
      { role: Role.USER, content: 'Compare <div> and <span> tags' }
    ] );
  } );

  it( 'extracts every Role', () => {
    const roles = Object.values( Role );
    const body = roles.map( role => `<${role}>${role} body</${role}>` ).join( '\n' );

    expect( extractMessages( body ).map( message => message.role ) ).toEqual( roles );
  } );

  it( 'returns an empty array when there are no role tags', () => {
    expect( extractMessages( 'Generate a cinematic poster.' ) ).toEqual( [] );
  } );
} );

describe( 'parseContent', () => {
  it( 'returns messages and null instructions when role tags are present', () => {
    expect( parseContent( '<system>Hi</system>\n<user>Yo</user>' ) ).toEqual( {
      messages: [
        { role: Role.SYSTEM, content: 'Hi' },
        { role: Role.USER, content: 'Yo' }
      ],
      instructions: null
    } );
  } );

  it( 'keeps instructions null when messages are present even if extra text surrounds the tags', () => {
    expect( parseContent( 'Note\n<user>Yo</user>\nTail' ).instructions ).toBeNull();
  } );

  it( 'returns instructions and no messages when there are no role tags', () => {
    expect( parseContent( 'Generate a cinematic poster.' ) ).toEqual( {
      messages: [],
      instructions: 'Generate a cinematic poster.'
    } );
  } );
} );
