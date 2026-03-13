import { describe, it, expect } from 'vitest';
import { getDevSuccessMessage } from './messages.js';

const mockServices = [
  { name: 'api' },
  { name: 'postgresql' },
  { name: 'redis' },
  { name: 'temporal' },
  { name: 'temporal-ui' },
  { name: 'worker' }
];

describe( 'messages', () => {
  describe( 'getDevSuccessMessage', () => {
    it( 'should return a string', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( typeof message ).toBe( 'string' );
    } );

    it( 'should include the Temporal UI URL', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( message ).toContain( 'http://localhost:8080' );
    } );

    it( 'should include the Temporal server address', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( message ).toContain( 'localhost:7233' );
    } );

    it( 'should include the API server address', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( message ).toContain( 'localhost:3001' );
    } );

    it( 'should include workflow run example', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( message ).toContain( 'output workflow run' );
    } );

    it( 'should include success indicator', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( message ).toContain( 'SUCCESS' );
    } );

    it( 'should include services section', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( message ).toContain( 'Temporal UI' );
      expect( message ).toContain( 'API Server' );
      expect( message ).toContain( 'Redis' );
    } );

    it( 'should include helpful tip about Temporal UI', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( message ).toContain( 'Temporal UI' );
      expect( message ).toContain( 'workflow' );
    } );

    it( 'should include dynamic docker logs command with service names', () => {
      const message = getDevSuccessMessage( mockServices );
      expect( message ).toContain( 'docker compose -p' );
      expect( message ).toContain( 'logs -f' );
      expect( message ).toContain( 'api|postgresql|redis|temporal|temporal-ui|worker' );
    } );
  } );
} );
