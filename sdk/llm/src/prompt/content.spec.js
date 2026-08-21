import { describe, it, expect } from 'vitest';
import { FatalError } from '@outputai/core';
import { Role } from '../consts.js';
import { parseContent } from './content.js';

const cached = { anthropic: { cacheControl: { type: 'ephemeral' } } };
const cachedLong = { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } };
const thinking = { anthropic: { thinking: { type: 'enabled' } } };
const openaiKey = { openai: { promptCacheKey: 'enrich-v1' } };

describe( 'parseContent', () => {
  describe( 'messages and instructions', () => {
    it( 'returns messages and null instructions when role tags are present', () => {
      expect( parseContent( '<system>Hi</system>\n<user>Yo</user>' ) ).toEqual( {
        messages: [
          { role: Role.SYSTEM, content: 'Hi' },
          { role: Role.USER, content: 'Yo' }
        ],
        instructions: null
      } );
    } );

    it( 'treats content that starts with text as instructions', () => {
      expect( parseContent( 'Note\n<user>Yo</user>\nTail' ) ).toEqual( {
        messages: [],
        instructions: 'Note\n<user>Yo</user>\nTail'
      } );
    } );

    it( 'returns instructions and no messages when there are no role tags', () => {
      expect( parseContent( 'Generate a cinematic poster.' ) ).toEqual( {
        messages: [],
        instructions: 'Generate a cinematic poster.'
      } );
    } );

    it( 'trims instructions', () => {
      expect( parseContent( '  poster  ' ).instructions ).toBe( 'poster' );
    } );

    it( 'extracts every authored prompt role', () => {
      const roles = [ Role.SYSTEM, Role.USER, Role.ASSISTANT ];
      const body = roles.map( role => `<${role}>${role} body</${role}>` ).join( '\n' );

      expect( parseContent( body ).messages.map( message => message.role ) ).toEqual( roles );
    } );

    it( 'omits providerOptions when the tag has no options attribute', () => {
      expect( parseContent( '<user>Hi</user>' ).messages[0] ).toEqual( { role: Role.USER, content: 'Hi' } );
    } );

    it( 'trims each message body', () => {
      expect( parseContent( '<user>\n  Hello  \n</user>' ).messages[0].content ).toBe( 'Hello' );
    } );

    it( 'decodes XML entities in message content', () => {
      expect( parseContent( '<user>R&amp;D &lt; Speed</user>' ).messages[0].content ).toBe( 'R&D < Speed' );
    } );

    it( 'keeps a different nested role tag inside the top-level message', () => {
      const body = [
        '<user>',
        'Here:',
        '```',
        '<system>sys</system>',
        '```',
        '</user>'
      ].join( '\n' );

      expect( parseContent( body ) ).toEqual( {
        messages: [ {
          role: Role.USER,
          content: 'Here:\n```\n<system>sys</system>\n```'
        } ],
        instructions: null
      } );
    } );

    it( 'rejects a nested tag with the same role', () => {
      expect( () => parseContent( '<user>ass<user>asasas</user></user>' ) )
        .toThrow( 'Invalid child tag: <user> cannot appear inside another <user>. Escape it as "&lt;user&gt;".' );
    } );

    it( 'rejects an invalid top-level role', () => {
      expect( () => parseContent( '<div><user>Hi</user></div>' ) )
        .toThrow( 'Message has invalid role "div".' );
      expect( () => parseContent( '<tool>Search result</tool>' ) )
        .toThrow( 'Message has invalid role "tool".' );
    } );

    it( 'keeps closed inner markup in the message body', () => {
      expect( parseContent( '<user>Compare <div></div> and <span></span> tags</user>' ).messages[0].content )
        .toBe( 'Compare <div></div> and <span></span> tags' );
    } );
  } );

  describe( 'options attribute', () => {
    it( 'resolves a referenced messageOptions set into providerOptions', () => {
      expect( parseContent( '<system options="cached">Docs</system>\n<user>Hello</user>', { cached } ) ).toEqual( {
        messages: [
          { role: Role.SYSTEM, content: 'Docs', providerOptions: cached },
          { role: Role.USER, content: 'Hello' }
        ],
        instructions: null
      } );
    } );

    it( 'does not put attributes on the message', () => {
      const [ system ] = parseContent( '<system options="cached">Docs</system>', { cached } ).messages;
      expect( system ).not.toHaveProperty( 'attributes' );
    } );

    it( 'lowercases the options attribute name', () => {
      const [ system ] = parseContent( '<system OPTIONS="cached">Docs</system>', { cached } ).messages;
      expect( system.providerOptions ).toEqual( cached );
    } );

    it( 'splits multiple set names on whitespace', () => {
      const [ system ] = parseContent(
        '<system options="cached openaiKey">Docs</system>',
        { cached: cachedLong, openaiKey }
      ).messages;

      expect( system.providerOptions ).toEqual( { ...cachedLong, ...openaiKey } );
    } );

    it( 'trims extra whitespace around set names', () => {
      const [ system ] = parseContent( '<system options="  cached  ">Docs</system>', { cached } ).messages;
      expect( system.providerOptions ).toEqual( cached );
    } );

    it( 'treats blank or whitespace-only options as no options', () => {
      expect( parseContent( '<system options="  ">Docs</system>' ).messages ).toEqual( [
        { role: Role.SYSTEM, content: 'Docs' }
      ] );
      expect( parseContent( '<system options="">Docs</system>' ).messages ).toEqual( [
        { role: Role.SYSTEM, content: 'Docs' }
      ] );
    } );

    it( 'throws when options has no value', () => {
      expect( () => parseContent( '<system options>Docs</system>' ) )
        .toThrow( new FatalError( 'Message "options" attribute must have a value.' ) );
    } );

    it( 'merges keys from two sets that share a provider namespace', () => {
      const [ system ] = parseContent(
        '<system options="cached thinking">Docs</system>',
        { cached, thinking }
      ).messages;

      expect( system.providerOptions ).toEqual( {
        anthropic: {
          cacheControl: { type: 'ephemeral' },
          thinking: { type: 'enabled' }
        }
      } );
    } );

    it( 'lets a later set win on overlapping keys in the same namespace', () => {
      const [ system ] = parseContent(
        '<system options="short long">Docs</system>',
        { short: cached, long: cachedLong }
      ).messages;

      expect( system.providerOptions ).toEqual( cachedLong );
    } );

    it( 'replaces nested objects instead of deep-merging them', () => {
      const [ system ] = parseContent(
        '<system options="withTtl noTtl">Docs</system>',
        { withTtl: cachedLong, noTtl: cached }
      ).messages;

      expect( system.providerOptions.anthropic.cacheControl ).toEqual( { type: 'ephemeral' } );
    } );

    it( 'applies the same set twice without changing the result', () => {
      const once = parseContent( '<system options="cached">Docs</system>', { cached } );
      const twice = parseContent( '<system options="cached cached">Docs</system>', { cached } );

      expect( twice.messages[0].providerOptions ).toEqual( once.messages[0].providerOptions );
    } );

    it( 'throws when the tag has an unsupported attribute', () => {
      expect( () => parseContent( '<system options="cached" ttl="1h">Docs</system>', { cached } ) )
        .toThrow( FatalError );
      expect( () => parseContent( '<system pinned>Docs</system>' ) ).toThrow( /unsupported attributes/ );
      expect( () => parseContent( '<user data="x">Hi</user>' ) ).toThrow( /unsupported attributes/ );
    } );

    it( 'throws when options is set but messageOptions is missing or empty', () => {
      expect( () => parseContent( '<system options="cached">Docs</system>' ) )
        .toThrow( /config.messageOptions/ );
      expect( () => parseContent( '<system options="cached">Docs</system>', {} ) )
        .toThrow( /config.messageOptions/ );
    } );

    it( 'throws when a set name is not in messageOptions', () => {
      expect( () => parseContent( '<user options="missing">Hello</user>', { cached } ) )
        .toThrow( /unknown option "missing"/ );
    } );

    it( 'does not throw on missing messageOptions when no tag uses options', () => {
      expect( () => parseContent( '<user>Hello</user>' ) ).not.toThrow();
    } );
  } );
} );
