import { describe, expect, it } from 'vitest';
import {
  extractCollidedPort, formatPortCollisionHint, formatPortCollisionsHint, formatComposeFailure
} from './port_collision.js';

const DEFAULT_PORTS = { api: 3001, temporalUi: 8080, temporal: 7233 };

describe( 'extractCollidedPort', () => {
  it( 'matches the "Bind for ... port is already allocated" shape', () => {
    expect( extractCollidedPort( 'Bind for 0.0.0.0:3001 failed: port is already allocated' ) ).toBe( 3001 );
  } );

  it( 'matches the "failed to bind host port ... address already in use" shape', () => {
    const stderr = 'Error: failed to bind host port for 0.0.0.0:7233:172.17.0.2:7233/tcp: address already in use';
    expect( extractCollidedPort( stderr ) ).toBe( 7233 );
  } );

  it( 'matches the "listen tcp ... bind: address already in use" shape', () => {
    expect( extractCollidedPort( 'listen tcp 127.0.0.1:8080: bind: address already in use' ) ).toBe( 8080 );
  } );

  it( 'returns the first port when stderr contains multiple bind failures', () => {
    const stderr = [
      'Bind for 0.0.0.0:3001 failed: port is already allocated',
      'Bind for 0.0.0.0:8080 failed: port is already allocated'
    ].join( '\n' );
    expect( extractCollidedPort( stderr ) ).toBe( 3001 );
  } );

  it( 'returns null when no bind failure is present', () => {
    expect( extractCollidedPort( 'some unrelated stderr line' ) ).toBeNull();
  } );

  // Captured verbatim from Docker 29.4.0 on macOS. The bind failure is nested
  // three wrappers deep; matching whole message shapes missed it.
  it( 'extracts the port from Docker 29\'s nested container-networking wrapper', () => {
    const stderr = 'Error response from daemon: failed to set up container networking: ' +
      'driver failed programming external connectivity on endpoint out-api-1 ' +
      '(e72baf85643fb5dc19000acf62c1ad0d11bffc653cabe1fc8861387ec1ebd629): ' +
      'Bind for 0.0.0.0:3001 failed: port is already allocated';
    expect( extractCollidedPort( stderr ) ).toBe( 3001 );
  } );

  it( 'extracts the port from the "ports are not available" wrapper', () => {
    const stderr = 'Error: ports are not available: exposing port TCP 0.0.0.0:3001 -> 0.0.0.0:0: ' +
      'listen tcp 0.0.0.0:3001: bind: address already in use';
    expect( extractCollidedPort( stderr ) ).toBe( 3001 );
  } );

  it( 'ignores an IP-like prefix and takes the port nearest the failure phrase', () => {
    const stderr = 'container 172.17.0.2:5432 started\nBind for 0.0.0.0:8080 failed: port is already allocated';
    expect( extractCollidedPort( stderr ) ).toBe( 8080 );
  } );

  it( 'returns null for empty input', () => {
    expect( extractCollidedPort( '' ) ).toBeNull();
  } );
} );

describe( 'formatPortCollisionHint', () => {
  it( 'names the env var when the colliding port matches a default', () => {
    const hint = formatPortCollisionHint(
      'Bind for 0.0.0.0:3001 failed: port is already allocated',
      DEFAULT_PORTS
    );
    expect( hint ).toContain( 'Port 3001 is already in use.' );
    expect( hint ).toContain( 'OUTPUT_API_HOST_PORT=<other port>' );
  } );

  it( 'names the env var for Temporal gRPC collisions', () => {
    const hint = formatPortCollisionHint(
      'failed to bind host port for 0.0.0.0:7233:172.17.0.2:7233/tcp: address already in use',
      DEFAULT_PORTS
    );
    expect( hint ).toContain( 'OUTPUT_TEMPORAL_HOST_PORT=<other port>' );
  } );

  it( 'resolves an overridden port back to its env var', () => {
    const hint = formatPortCollisionHint(
      'Bind for 0.0.0.0:3050 failed: port is already allocated',
      { ...DEFAULT_PORTS, api: 3050 }
    );
    expect( hint ).toContain( 'OUTPUT_API_HOST_PORT=<other port>' );
  } );

  it( 'falls back to a generic suggestion for unknown ports', () => {
    const hint = formatPortCollisionHint(
      'Bind for 0.0.0.0:5432 failed: port is already allocated',
      DEFAULT_PORTS
    );
    expect( hint ).toContain( 'Port 5432 is already in use.' );
    expect( hint ).not.toContain( 'OUTPUT_' );
    expect( hint ).toContain( 'Stop the process holding it' );
  } );

  it( 'returns null when stderr has no recognizable bind failure', () => {
    expect( formatPortCollisionHint( 'compose succeeded then exited', DEFAULT_PORTS ) ).toBeNull();
  } );

  it( 'returns null for empty stderr', () => {
    expect( formatPortCollisionHint( '', DEFAULT_PORTS ) ).toBeNull();
  } );
} );

describe( 'formatPortCollisionsHint', () => {
  it( 'returns an empty string when no ports collide', () => {
    expect( formatPortCollisionsHint( [], DEFAULT_PORTS ) ).toBe( '' );
  } );

  it( 'matches the single-port hint when exactly one port collides', () => {
    const list = formatPortCollisionsHint( [ 3001 ], DEFAULT_PORTS );
    const single = formatPortCollisionHint(
      'Bind for 0.0.0.0:3001 failed: port is already allocated',
      DEFAULT_PORTS
    );
    expect( list ).toBe( single );
  } );

  it( 'renders a bulleted list with one line per port when multiple collide', () => {
    const hint = formatPortCollisionsHint( [ 3001, 7233 ], DEFAULT_PORTS );
    expect( hint ).toContain( 'Multiple host ports are already in use:' );
    expect( hint ).toContain( '• Port 3001 — override with OUTPUT_API_HOST_PORT=<other port>' );
    expect( hint ).toContain( '• Port 7233 — override with OUTPUT_TEMPORAL_HOST_PORT=<other port>' );
  } );

  it( 'preserves the order of ports as supplied', () => {
    const hint = formatPortCollisionsHint( [ 7233, 3001 ], DEFAULT_PORTS );
    const lines = hint.split( '\n' );
    expect( lines[1] ).toContain( 'Port 7233' );
    expect( lines[2] ).toContain( 'Port 3001' );
  } );

  it( 'falls back to a generic suggestion for unknown ports inside a list', () => {
    const hint = formatPortCollisionsHint( [ 3001, 5432 ], DEFAULT_PORTS );
    expect( hint ).toContain( '• Port 3001 — override with OUTPUT_API_HOST_PORT=<other port>' );
    expect( hint ).toContain( '• Port 5432 — stop the process holding it' );
  } );
} );

describe( 'formatComposeFailure', () => {
  const reason = 'Docker compose failed to start services (exit code 1).';

  it( 'prepends the actionable hint when the output names a collision', () => {
    const message = formatComposeFailure(
      reason,
      'Bind for 0.0.0.0:3001 failed: port is already allocated',
      DEFAULT_PORTS
    );
    expect( message.startsWith( 'Port 3001 is already in use.' ) ).toBe( true );
    expect( message ).toContain( 'OUTPUT_API_HOST_PORT=<other port>' );
    expect( message ).toContain( reason );
    expect( message ).toContain( 'Recent Docker output:' );
  } );

  it( 'omits the output section entirely when nothing was captured', () => {
    const message = formatComposeFailure( reason, '', DEFAULT_PORTS );
    expect( message ).toBe( reason );
    expect( message ).not.toContain( 'Recent Docker output:' );
  } );

  it( 'returns reason plus raw output, with no hint, for an unrecognized failure', () => {
    const message = formatComposeFailure( reason, 'no such image: outputai/api:dev', DEFAULT_PORTS );
    expect( message.startsWith( reason ) ).toBe( true );
    expect( message ).toContain( 'Recent Docker output:\nno such image' );
    expect( message ).not.toContain( 'is already in use' );
  } );
} );
