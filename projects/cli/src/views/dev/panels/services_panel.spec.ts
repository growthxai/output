import { describe, expect, it } from 'vitest';
import { compareService } from './services_panel.js';
import type { ServiceStatus } from '#services/docker.js';

const svc = ( name: string ): ServiceStatus => ( {
  name,
  state: 'running',
  health: 'healthy',
  ports: []
} );

describe( 'compareService', () => {
  it( 'puts worker before api', () => {
    expect( compareService( svc( 'worker' ), svc( 'api' ) ) ).toBeLessThan( 0 );
  } );

  it( 'puts api before alphabetically-earlier names', () => {
    expect( compareService( svc( 'api' ), svc( 'aardvark' ) ) ).toBeLessThan( 0 );
  } );

  it( 'puts worker before alphabetically-earlier names', () => {
    expect( compareService( svc( 'worker' ), svc( 'aardvark' ) ) ).toBeLessThan( 0 );
  } );

  it( 'sorts non-priority services alphabetically', () => {
    expect( compareService( svc( 'postgres' ), svc( 'redis' ) ) ).toBeLessThan( 0 );
    expect( compareService( svc( 'temporal' ), svc( 'redis' ) ) ).toBeGreaterThan( 0 );
  } );

  it( 'produces the expected full ordering for a real stack', () => {
    const stack = [ svc( 'temporal-ui' ), svc( 'redis' ), svc( 'postgres' ), svc( 'api' ), svc( 'worker' ), svc( 'temporal' ) ];
    const sorted = [ ...stack ].sort( compareService ).map( s => s.name );
    expect( sorted ).toEqual( [ 'worker', 'api', 'postgres', 'redis', 'temporal', 'temporal-ui' ] );
  } );
} );
