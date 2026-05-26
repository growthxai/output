import { describe, expect, it } from 'vitest';
import { extractCollidedPort, formatPortCollisionHint, formatPortCollisionsHint } from './port_collision.js';

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
