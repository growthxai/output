import { describe, it, expect } from 'vitest';
import redactHeaders from './redact_headers.js';

describe( 'redactHeaders', () => {
  describe( 'with Record<string, string> input', () => {
    it( 'should redact sensitive headers (case insensitive)', () => {
      const headers = {
        Authorization: 'Bearer token123',
        'X-API-Key': 'secret-key',
        apikey: 'another-secret',
        'X-Auth-Token': 'auth-token',
        'Secret-Header': 'top-secret',
        Password: 'password123',
        'Private-Key': 'private-key-data',
        Cookie: 'session=abc123',
        'Content-Type': 'application/json',
        'User-Agent': 'test-agent'
      };

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        Authorization: '[REDACTED]',
        'X-API-Key': '[REDACTED]',
        apikey: '[REDACTED]',
        'X-Auth-Token': '[REDACTED]',
        'Secret-Header': '[REDACTED]',
        Password: '[REDACTED]',
        'Private-Key': '[REDACTED]',
        Cookie: '[REDACTED]',
        'Content-Type': 'application/json',
        'User-Agent': 'test-agent'
      } );
    } );

    it( 'should handle mixed case header names', () => {
      const headers = {
        AUTHORIZATION: 'Bearer token',
        'x-api-key': 'secret',
        'Api-Key': 'another-secret',
        'TOKEN-HEADER': 'token-value',
        'content-type': 'application/json'
      };

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        AUTHORIZATION: '[REDACTED]',
        'x-api-key': '[REDACTED]',
        'Api-Key': '[REDACTED]',
        'TOKEN-HEADER': '[REDACTED]',
        'content-type': 'application/json'
      } );
    } );

    it( 'should not redact non-sensitive headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'test-agent',
        'X-Custom-Header': 'custom-value',
        'Cache-Control': 'no-cache'
      };

      const result = redactHeaders( headers );

      expect( result ).toEqual( headers );
    } );

    it( 'should handle empty headers object', () => {
      const headers = {};
      const result = redactHeaders( headers );
      expect( result ).toEqual( {} );
    } );

    it( 'should handle headers with empty values', () => {
      const headers = {
        Authorization: '',
        'Content-Type': 'application/json',
        'X-API-Key': ''
      };

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        Authorization: '[REDACTED]',
        'Content-Type': 'application/json',
        'X-API-Key': '[REDACTED]'
      } );
    } );
  } );

  describe( 'with Headers object input', () => {
    it( 'should redact sensitive headers from Headers object', () => {
      const headers = new Headers();
      headers.set( 'Authorization', 'Bearer token123' );
      headers.set( 'X-API-Key', 'secret-key' );
      headers.set( 'Content-Type', 'application/json' );
      headers.set( 'User-Agent', 'test-agent' );

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        authorization: '[REDACTED]',
        'x-api-key': '[REDACTED]',
        'content-type': 'application/json',
        'user-agent': 'test-agent'
      } );
    } );

    it( 'should handle empty Headers object', () => {
      const headers = new Headers();
      const result = redactHeaders( headers );
      expect( result ).toEqual( {} );
    } );

    it( 'should preserve header name casing from Headers object', () => {
      const headers = new Headers();
      headers.set( 'authorization', 'Bearer token' );
      headers.set( 'X-Custom-Header', 'value' );

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        authorization: '[REDACTED]',
        'x-custom-header': 'value'
      } );
    } );
  } );

  describe( 'sensitive header patterns', () => {
    it( 'should redact headers containing "authorization"', () => {
      const headers = {
        Authorization: 'Bearer token',
        'X-Authorization': 'token',
        'Custom-Authorization-Header': 'value'
      };

      const result = redactHeaders( headers );

      Object.keys( result ).forEach( key => {
        if ( key.toLowerCase().includes( 'authorization' ) ) {
          expect( result[key] ).toBe( '[REDACTED]' );
        }
      } );
    } );

    it( 'should redact headers containing "token"', () => {
      const headers = {
        'X-Auth-Token': 'token123',
        'Access-Token': 'access123',
        'Refresh-Token': 'refresh123',
        'Token-Header': 'token-value'
      };

      const result = redactHeaders( headers );

      Object.keys( result ).forEach( key => {
        expect( result[key] ).toBe( '[REDACTED]' );
      } );
    } );

    it( 'should redact headers containing "api-key" or "apikey"', () => {
      const headers = {
        'X-API-Key': 'key123',
        'X-Api-Key': 'key456',
        apikey: 'key789',
        'Custom-ApiKey': 'custom-key'
      };

      const result = redactHeaders( headers );

      Object.keys( result ).forEach( key => {
        expect( result[key] ).toBe( '[REDACTED]' );
      } );
    } );

    it( 'should redact headers containing "secret"', () => {
      const headers = {
        'X-Secret': 'secret123',
        'Client-Secret': 'client-secret',
        'Secret-Key': 'secret-key'
      };

      const result = redactHeaders( headers );

      Object.keys( result ).forEach( key => {
        expect( result[key] ).toBe( '[REDACTED]' );
      } );
    } );

    it( 'should redact headers containing "password"', () => {
      const headers = {
        Password: 'pass123',
        'X-Password': 'secret-pass',
        'User-Password': 'user-pass'
      };

      const result = redactHeaders( headers );

      Object.keys( result ).forEach( key => {
        expect( result[key] ).toBe( '[REDACTED]' );
      } );
    } );

    it( 'should redact headers containing "key"', () => {
      const headers = {
        'Private-Key': 'private123',
        'Public-Key': 'public123',
        'Encryption-Key': 'encrypt123',
        'Symmetric-Key': 'sym123'
      };

      const result = redactHeaders( headers );

      Object.keys( result ).forEach( key => {
        expect( result[key] ).toBe( '[REDACTED]' );
      } );
    } );

    it( 'should redact headers containing "cookie"', () => {
      const headers = {
        Cookie: 'session=abc123',
        'Set-Cookie': 'token=xyz789',
        'X-Cookie-Data': 'cookie-info'
      };

      const result = redactHeaders( headers );

      Object.keys( result ).forEach( key => {
        expect( result[key] ).toBe( '[REDACTED]' );
      } );
    } );
  } );

  describe( 'edge cases', () => {
    it( 'should handle headers with special characters in values', () => {
      const headers = {
        Authorization: 'Bearer !@#$%^&*()_+-=[]{}|;:,.<>?',
        'Content-Type': 'application/json; charset=utf-8'
      };

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        Authorization: '[REDACTED]',
        'Content-Type': 'application/json; charset=utf-8'
      } );
    } );

    it( 'should handle headers with unicode characters', () => {
      const headers = {
        'X-API-Key': '🔑secret-key🔐',
        'X-Custom': 'héllo wörld'
      };

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        'X-API-Key': '[REDACTED]',
        'X-Custom': 'héllo wörld'
      } );
    } );

    it( 'should handle very long header values', () => {
      const longValue = 'a'.repeat( 10000 );
      const headers = {
        Authorization: `Bearer ${longValue}`,
        'X-Long-Header': longValue
      };

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        Authorization: '[REDACTED]',
        'X-Long-Header': longValue
      } );
    } );

    it( 'should match partial words in header names (current behavior)', () => {
      const headers = {
        Keyboard: 'qwerty', // contains "key" - will be redacted
        Secretary: 'admin', // contains "secret" - will be redacted
        Tokens: 'abc123', // contains "token" - will be redacted
        'Content-Length': '123' // doesn't contain sensitive patterns - will not be redacted
      };

      const result = redactHeaders( headers );

      expect( result ).toEqual( {
        Keyboard: '[REDACTED]',
        Secretary: '[REDACTED]',
        Tokens: '[REDACTED]',
        'Content-Length': '123'
      } );
    } );
  } );
} );
