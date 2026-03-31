import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { parseServiceStatus, getServiceStatus, waitForServicesHealthy, isServiceHealthy, isServiceFailed } from './docker.js';

vi.mock( 'node:child_process', () => ( {
  execSync: vi.fn(),
  execFileSync: vi.fn(),
  spawn: vi.fn()
} ) );

vi.mock( 'log-update', () => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { done: ReturnType<typeof vi.fn> };
  fn.done = vi.fn();
  return { default: fn };
} );

describe( 'docker service', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'parseServiceStatus', () => {
    it( 'should parse single service JSON output', () => {
      const jsonOutput = '{"Service":"redis","State":"running","Health":"healthy","Publishers":[{"PublishedPort":6379,"TargetPort":6379}]}';

      const result = parseServiceStatus( jsonOutput );

      expect( result ).toHaveLength( 1 );
      expect( result[0] ).toEqual( {
        name: 'redis',
        state: 'running',
        health: 'healthy',
        ports: [ '6379:6379' ]
      } );
    } );

    it( 'should parse multiple services from JSON lines output', () => {
      const jsonOutput = `{"Service":"redis","State":"running","Health":"healthy","Publishers":[{"PublishedPort":6379,"TargetPort":6379}]}
{"Service":"temporal","State":"running","Health":"healthy","Publishers":[{"PublishedPort":7233,"TargetPort":7233}]}
{"Service":"temporal-ui","State":"running","Health":"","Publishers":[{"PublishedPort":8080,"TargetPort":8080}]}`;

      const result = parseServiceStatus( jsonOutput );

      expect( result ).toHaveLength( 3 );
      expect( result[0].name ).toBe( 'redis' );
      expect( result[1].name ).toBe( 'temporal' );
      expect( result[2].name ).toBe( 'temporal-ui' );
    } );

    it( 'should handle empty health status', () => {
      const jsonOutput = '{"Service":"api","State":"running","Health":"","Publishers":[]}';

      const result = parseServiceStatus( jsonOutput );

      expect( result[0].health ).toBe( 'none' );
    } );

    it( 'should handle missing Publishers array', () => {
      const jsonOutput = '{"Service":"worker","State":"running","Health":"healthy"}';

      const result = parseServiceStatus( jsonOutput );

      expect( result[0].ports ).toEqual( [] );
    } );

    it( 'should handle empty output', () => {
      const result = parseServiceStatus( '' );

      expect( result ).toEqual( [] );
    } );

    it( 'should filter out empty lines', () => {
      const jsonOutput = `{"Service":"redis","State":"running","Health":"healthy","Publishers":[]}

{"Service":"api","State":"running","Health":"","Publishers":[]}
`;

      const result = parseServiceStatus( jsonOutput );

      expect( result ).toHaveLength( 2 );
    } );

    it( 'should use Name field as fallback when Service is missing', () => {
      const jsonOutput = '{"Name":"output-sdk-redis-1","State":"running","Health":"healthy","Publishers":[]}';

      const result = parseServiceStatus( jsonOutput );

      expect( result[0].name ).toBe( 'output-sdk-redis-1' );
    } );
  } );

  describe( 'getServiceStatus', () => {
    it( 'should call docker compose ps with correct arguments', async () => {
      const mockOutput = '{"Service":"redis","State":"running","Health":"healthy","Publishers":[]}';
      vi.mocked( execFileSync ).mockReturnValue( mockOutput );

      await getServiceStatus( '/path/to/docker-compose.yml' );

      expect( execFileSync ).toHaveBeenCalledWith(
        'docker',
        [ 'compose', '-f', '/path/to/docker-compose.yml', 'ps', '--all', '--format', 'json' ],
        expect.objectContaining( { encoding: 'utf-8' } )
      );
    } );

    it( 'should return parsed service status', async () => {
      const mockOutput = '{"Service":"redis","State":"running","Health":"healthy","Publishers":[{"PublishedPort":6379,"TargetPort":6379}]}';
      vi.mocked( execFileSync ).mockReturnValue( mockOutput );

      const result = await getServiceStatus( '/path/to/docker-compose.yml' );

      expect( result ).toHaveLength( 1 );
      expect( result[0].name ).toBe( 'redis' );
    } );

    it( 'should throw error when docker compose command fails', async () => {
      vi.mocked( execFileSync ).mockImplementation( () => {
        throw new Error( 'Docker command failed' );
      } );

      await expect( getServiceStatus( '/path/to/docker-compose.yml' ) ).rejects.toThrow();
    } );
  } );

  describe( 'isServiceHealthy', () => {
    it( 'should return true for a running service with health: healthy', () => {
      expect( isServiceHealthy( { name: 'redis', state: 'running', health: 'healthy', ports: [] } ) ).toBe( true );
    } );

    it( 'should return true for a running service with no health check (health: none)', () => {
      expect( isServiceHealthy( { name: 'api', state: 'running', health: 'none', ports: [] } ) ).toBe( true );
    } );

    it( 'should return false for a running service with health: unhealthy', () => {
      expect( isServiceHealthy( { name: 'worker', state: 'running', health: 'unhealthy', ports: [] } ) ).toBe( false );
    } );

    it( 'should return false for an exited service with health: none', () => {
      expect( isServiceHealthy( { name: 'worker', state: 'exited', health: 'none', ports: [] } ) ).toBe( false );
    } );

    it( 'should return false for an exited service with health: unhealthy', () => {
      expect( isServiceHealthy( { name: 'worker', state: 'exited', health: 'unhealthy', ports: [] } ) ).toBe( false );
    } );

    it( 'should return false for a service with health: starting', () => {
      expect( isServiceHealthy( { name: 'temporal', state: 'running', health: 'starting', ports: [] } ) ).toBe( false );
    } );
  } );

  describe( 'isServiceFailed', () => {
    it( 'should return true for an exited service with health: none', () => {
      expect( isServiceFailed( { name: 'worker', state: 'exited', health: 'none', ports: [] } ) ).toBe( true );
    } );

    it( 'should return true for a running service with health: unhealthy', () => {
      expect( isServiceFailed( { name: 'worker', state: 'running', health: 'unhealthy', ports: [] } ) ).toBe( true );
    } );

    it( 'should return true for an exited service with health: unhealthy', () => {
      expect( isServiceFailed( { name: 'worker', state: 'exited', health: 'unhealthy', ports: [] } ) ).toBe( true );
    } );

    it( 'should return false for a running service with health: healthy', () => {
      expect( isServiceFailed( { name: 'redis', state: 'running', health: 'healthy', ports: [] } ) ).toBe( false );
    } );

    it( 'should return false for a running service with health: none', () => {
      expect( isServiceFailed( { name: 'api', state: 'running', health: 'none', ports: [] } ) ).toBe( false );
    } );

    it( 'should return false for a service with health: starting — not a failure, just in progress', () => {
      expect( isServiceFailed( { name: 'temporal', state: 'running', health: 'starting', ports: [] } ) ).toBe( false );
    } );
  } );

  describe( 'waitForServicesHealthy', () => {
    it( 'should resolve when all services are healthy', async () => {
      const mockOutput = `{"Service":"redis","State":"running","Health":"healthy","Publishers":[]}
{"Service":"temporal","State":"running","Health":"healthy","Publishers":[]}`;
      vi.mocked( execFileSync ).mockReturnValue( mockOutput );

      await expect( waitForServicesHealthy( '/path/to/docker-compose.yml', 5000 ) ).resolves.toBeUndefined();
    } );

    it( 'should resolve when services have no health check (health: none)', async () => {
      const mockOutput = `{"Service":"redis","State":"running","Health":"healthy","Publishers":[]}
{"Service":"api","State":"running","Health":"","Publishers":[]}`;
      vi.mocked( execFileSync ).mockReturnValue( mockOutput );

      await expect( waitForServicesHealthy( '/path/to/docker-compose.yml', 5000 ) ).resolves.toBeUndefined();
    } );

    it( 'should timeout when services remain unhealthy', async () => {
      const mockOutput = '{"Service":"redis","State":"running","Health":"starting","Publishers":[]}';
      vi.mocked( execFileSync ).mockReturnValue( mockOutput );

      const promise = waitForServicesHealthy( '/path/to/docker-compose.yml', 100 );
      await expect( promise ).rejects.toThrow( 'Timeout waiting for services to become healthy' );
    }, 10000 );

    it( 'should not resolve when a service has exited with no health check — regression OUT-334', async () => {
      // Exited containers have empty Health which parses to 'none'.
      // Previously, state:exited + health:none was incorrectly treated as healthy.
      const mockOutput = `{"Service":"redis","State":"running","Health":"healthy","Publishers":[]}
{"Service":"worker","State":"exited","Health":"","Publishers":[]}`;
      vi.mocked( execFileSync ).mockReturnValue( mockOutput );

      const promise = waitForServicesHealthy( '/path/to/docker-compose.yml', 100, 50 );
      await expect( promise ).rejects.toThrow( 'Timeout waiting for services to become healthy' );
    }, 10000 );

    it( 'should not resolve when a service is running but unhealthy — regression OUT-334', async () => {
      // Nodemon keeps the container running even when the exec'd command fails,
      // so the unhealthy case is state:running + health:unhealthy.
      const mockOutput = `{"Service":"redis","State":"running","Health":"healthy","Publishers":[]}
{"Service":"worker","State":"running","Health":"unhealthy","Publishers":[]}`;
      vi.mocked( execFileSync ).mockReturnValue( mockOutput );

      const promise = waitForServicesHealthy( '/path/to/docker-compose.yml', 100, 50 );
      await expect( promise ).rejects.toThrow( 'Timeout waiting for services to become healthy' );
    }, 10000 );

    it( 'should poll multiple times until healthy', async () => {
      const callTracker = { count: 0 };
      vi.mocked( execFileSync ).mockImplementation( () => {
        callTracker.count++;
        if ( callTracker.count < 3 ) {
          return '{"Service":"redis","State":"running","Health":"starting","Publishers":[]}';
        }
        return '{"Service":"redis","State":"running","Health":"healthy","Publishers":[]}';
      } );

      await waitForServicesHealthy( '/path/to/docker-compose.yml', 10000, 50 );

      expect( callTracker.count ).toBeGreaterThanOrEqual( 3 );
    } );
  } );
} );
