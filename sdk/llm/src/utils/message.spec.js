import { describe, it, expect } from 'vitest';
import { ROLE, getContent, isRole } from './message.js';

describe( 'message utils', () => {
  describe( 'ROLE', () => {
    it( 'exposes expected role string constants', () => {
      expect( ROLE ).toEqual( {
        SYSTEM: 'system',
        USER: 'user',
        ASSISTANT: 'assistant',
        TOOL: 'tool'
      } );
    } );
  } );

  describe( 'isRole', () => {
    it( 'returns a predicate that matches messages by role', () => {
      const isUser = isRole( ROLE.USER );
      expect( isUser( { role: 'user', content: 'hi' } ) ).toBe( true );
      expect( isUser( { role: 'assistant', content: 'bye' } ) ).toBe( false );
    } );
  } );

  describe( 'getContent', () => {
    it( 'returns message content', () => {
      expect( getContent( { role: 'user', content: 'hello' } ) ).toBe( 'hello' );
    } );
  } );
} );
