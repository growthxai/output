import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  parseServiceStatus, getServiceStatus,
  startDockerCompose, runDockerComposeUpDetached, stopDockerCompose,
  waitForServicesHealthy, isServiceHealthy, isServiceFailed,
  classifyStackState, STACK_STATE, type ServiceStatus,
  resolveDockerComposePath, getDefaultDockerComposePath, DockerComposeConfigNotFoundError
} from './docker.js';

vi.mock( 'node:child_process', () => ( {
  execSync: vi.fn(),
  execFileSync: vi.fn(),
  spawn: vi.fn()
} ) );

vi.mock( 'node:fs/promises', () => ( {
  default: { access: vi.fn() }
} ) );

const mockChildProcess = ( process: unknown ): ChildProcess => process as ChildProcess;

vi.mock( 'log-update', () => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { done: ReturnType<typeof vi.fn> };
  fn.done = vi.fn();
  return { default: fn };
} );

describe( 'docker service', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( spawn ).mockReturnValue( mockChildProcess( {
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() }
    } ) );
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
        [
          'compose', '-f', '/path/to/docker-compose.yml',
          '--project-directory', process.cwd(),
          '--project-name', 'output-sdk',
          'ps', '--all', '--format', 'json'
        ],
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

  describe( 'startDockerCompose', () => {
    it( 'should pass --project-name to docker compose up', async () => {
      await startDockerCompose( { dockerComposePath: '/path/to/docker-compose.yml' } );
      expect( spawn ).toHaveBeenCalledWith(
        'docker',
        [
          'compose', '-f', '/path/to/docker-compose.yml',
          '--project-directory', process.cwd(),
          '--project-name', 'output-sdk',
          'up'
        ],
        expect.objectContaining( { stdio: [ 'ignore', 'pipe', 'pipe' ], cwd: process.cwd() } )
      );
    } );

    it( 'should append --pull when pullPolicy is provided', async () => {
      await startDockerCompose( { dockerComposePath: '/path/to/docker-compose.yml', pullPolicy: 'always' } );
      expect( spawn ).toHaveBeenCalledWith(
        'docker',
        [
          'compose', '-f', '/path/to/docker-compose.yml',
          '--project-directory', process.cwd(),
          '--project-name', 'output-sdk',
          'up', '--pull', 'always'
        ],
        expect.objectContaining( { stdio: [ 'ignore', 'pipe', 'pipe' ], cwd: process.cwd() } )
      );
    } );

    it( 'should attach docker process handlers and pass captured output', async () => {
      const onError = vi.fn();
      const onExit = vi.fn();
      const processHandlers: {
        error?: ( error: Error ) => void;
        exit?: ( code: number | null, signal: NodeJS.Signals | null ) => void;
      } = {};
      const streamHandlers: {
        stdout?: ( chunk: Buffer ) => void;
        stderr?: ( chunk: Buffer ) => void;
      } = {};
      const process = {
        on: vi.fn( ( event: 'error' | 'close',
          handler: ( ( error: Error ) => void ) | ( ( code: number | null, signal: NodeJS.Signals | null ) => void ) ) => {
          if ( event === 'error' ) {
            processHandlers.error = handler as ( error: Error ) => void;
          } else {
            processHandlers.exit = handler as ( code: number | null, signal: NodeJS.Signals | null ) => void;
          }
          return process;
        } ),
        stdout: {
          on: vi.fn( ( event: 'data', handler: ( chunk: Buffer ) => void ) => {
            streamHandlers.stdout = handler;
            return process.stdout;
          } )
        },
        stderr: {
          on: vi.fn( ( event: 'data', handler: ( chunk: Buffer ) => void ) => {
            streamHandlers.stderr = handler;
            return process.stderr;
          } )
        }
      };
      vi.mocked( spawn ).mockReturnValue( mockChildProcess( process ) );

      const dockerProcess = await startDockerCompose( {
        dockerComposePath: '/path/to/docker-compose.yml',
        pullPolicy: 'always',
        onError,
        onExit
      } );

      expect( dockerProcess.on ).toHaveBeenCalledWith( 'error', expect.any( Function ) );
      expect( dockerProcess.on ).toHaveBeenCalledWith( 'close', expect.any( Function ) );

      streamHandlers.stdout?.( Buffer.from( 'starting services\n' ) );
      streamHandlers.stderr?.( Buffer.from( 'compose failed\n' ) );
      const error = new Error( 'Docker failed' );

      processHandlers.error?.( error );
      processHandlers.exit?.( 1, null );

      expect( onError ).toHaveBeenCalledWith( error, 'starting services\ncompose failed' );
      expect( onExit ).toHaveBeenCalledWith( 1, null, 'starting services\ncompose failed' );
    } );
  } );

  describe( 'runDockerComposeUpDetached', () => {
    const makeProcess = () => {
      const handlers: {
        error?: ( error: Error ) => void;
        exit?: ( code: number | null ) => void;
        stdout?: ( chunk: Buffer ) => void;
        stderr?: ( chunk: Buffer ) => void;
      } = {};
      const proc = {
        on: vi.fn( ( event: 'error' | 'close',
          handler: ( ( error: Error ) => void ) | ( ( code: number | null ) => void ) ) => {
          if ( event === 'error' ) {
            handlers.error = handler as ( error: Error ) => void;
          } else {
            handlers.exit = handler as ( code: number | null ) => void;
          }
          return proc;
        } ),
        stdout: {
          on: vi.fn( ( event: 'data', handler: ( chunk: Buffer ) => void ) => {
            handlers.stdout = handler;
            return proc.stdout;
          } )
        },
        stderr: {
          on: vi.fn( ( event: 'data', handler: ( chunk: Buffer ) => void ) => {
            handlers.stderr = handler;
            return proc.stderr;
          } )
        }
      };
      return { proc, handlers };
    };

    it( 'passes --project-name and -d, tees output, and resolves with the exit code', async () => {
      const { proc, handlers } = makeProcess();
      vi.mocked( spawn ).mockReturnValue( mockChildProcess( proc ) );
      const stdoutSpy = vi.spyOn( process.stdout, 'write' ).mockReturnValue( true );

      const promise = runDockerComposeUpDetached( '/path/to/docker-compose.yml' );

      expect( spawn ).toHaveBeenCalledWith(
        'docker',
        [
          'compose', '-f', '/path/to/docker-compose.yml',
          '--project-directory', process.cwd(),
          '--project-name', 'output-sdk',
          'up', '-d'
        ],
        expect.objectContaining( { cwd: process.cwd(), stdio: [ 'ignore', 'pipe', 'pipe' ] } )
      );

      handlers.stdout?.( Buffer.from( 'pulling images\n' ) );
      handlers.exit?.( 0 );

      expect( await promise ).toEqual( { code: 0, output: 'pulling images' } );
      expect( stdoutSpy ).toHaveBeenCalledWith( Buffer.from( 'pulling images\n' ) );
      stdoutSpy.mockRestore();
    } );

    it( 'appends --pull when pullPolicy is provided', async () => {
      const { proc, handlers } = makeProcess();
      vi.mocked( spawn ).mockReturnValue( mockChildProcess( proc ) );
      vi.spyOn( process.stdout, 'write' ).mockReturnValue( true );

      const promise = runDockerComposeUpDetached( '/path/to/docker-compose.yml', 'missing' );
      handlers.exit?.( 0 );
      await promise;

      expect( spawn ).toHaveBeenCalledWith(
        'docker',
        [
          'compose', '-f', '/path/to/docker-compose.yml',
          '--project-directory', process.cwd(),
          '--project-name', 'output-sdk',
          'up', '-d', '--pull', 'missing'
        ],
        expect.objectContaining( { cwd: process.cwd() } )
      );
    } );

    it( 'resolves with a non-zero code and captured stderr so the caller can hint the collision', async () => {
      const { proc, handlers } = makeProcess();
      vi.mocked( spawn ).mockReturnValue( mockChildProcess( proc ) );
      vi.spyOn( process.stderr, 'write' ).mockReturnValue( true );

      const promise = runDockerComposeUpDetached( '/path/to/docker-compose.yml' );
      handlers.stderr?.( Buffer.from( 'Error: address already in use\n' ) );
      handlers.exit?.( 1 );

      expect( await promise ).toEqual( { code: 1, output: 'Error: address already in use' } );
    } );

    it( 'rejects when the docker process fails to spawn', async () => {
      const { proc, handlers } = makeProcess();
      vi.mocked( spawn ).mockReturnValue( mockChildProcess( proc ) );

      const promise = runDockerComposeUpDetached( '/path/to/docker-compose.yml' );
      handlers.error?.( new Error( 'spawn ENOENT' ) );

      await expect( promise ).rejects.toThrow( 'spawn ENOENT' );
    } );
  } );

  describe( 'resolveDockerComposePath', () => {
    it( 'resolves a custom path against cwd and returns it when it exists', async () => {
      vi.mocked( fs.access ).mockResolvedValue( undefined );
      const result = await resolveDockerComposePath( 'custom/compose.yml' );
      const expected = path.resolve( process.cwd(), 'custom/compose.yml' );
      expect( result ).toBe( expected );
      expect( fs.access ).toHaveBeenCalledWith( expected );
    } );

    it( 'throws DockerComposeConfigNotFoundError when the path does not exist', async () => {
      vi.mocked( fs.access ).mockRejectedValue( new Error( 'ENOENT' ) );
      await expect( resolveDockerComposePath( 'missing.yml' ) )
        .rejects.toBeInstanceOf( DockerComposeConfigNotFoundError );
    } );

    it( 'falls back to the bundled default when no custom path is given', async () => {
      vi.mocked( fs.access ).mockResolvedValue( undefined );
      const result = await resolveDockerComposePath();
      expect( result ).toBe( getDefaultDockerComposePath() );
    } );
  } );

  describe( 'DOCKER_SERVICE_NAME wiring', () => {
    const saved = process.env.DOCKER_SERVICE_NAME;
    afterEach( () => {
      if ( saved === undefined ) {
        delete process.env.DOCKER_SERVICE_NAME;
      } else {
        process.env.DOCKER_SERVICE_NAME = saved;
      }
    } );

    it( 'threads DOCKER_SERVICE_NAME through to --project-name (not hardcoded output-sdk)', async () => {
      process.env.DOCKER_SERVICE_NAME = 'custom-project';
      vi.mocked( execFileSync ).mockReturnValue( '' );

      await stopDockerCompose( '/path/to/docker-compose.yml' );

      expect( execFileSync ).toHaveBeenCalledWith(
        'docker',
        [
          'compose', '-f', '/path/to/docker-compose.yml',
          '--project-directory', process.cwd(),
          '--project-name', 'custom-project',
          'down'
        ],
        expect.objectContaining( { stdio: 'inherit' } )
      );
    } );
  } );

  describe( 'stopDockerCompose', () => {
    it( 'should pass --project-name and --project-directory to docker compose down', async () => {
      vi.mocked( execFileSync ).mockReturnValue( '' );
      await stopDockerCompose( '/path/to/docker-compose.yml' );
      expect( execFileSync ).toHaveBeenCalledWith(
        'docker',
        [ 'compose', '-f', '/path/to/docker-compose.yml', '--project-directory', process.cwd(), '--project-name', 'output-sdk', 'down' ],
        expect.objectContaining( { stdio: 'inherit' } )
      );
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

    it( 'should return false for a created service with no health check', () => {
      expect( isServiceHealthy( { name: 'api', state: 'created', health: 'none', ports: [] } ) ).toBe( false );
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

  describe( 'classifyStackState', () => {
    const svc = ( state: string, health: string ): ServiceStatus =>
      ( { name: 's', state, health, ports: [] } );

    it( 'returns NONE for an empty stack (fresh start)', () => {
      expect( classifyStackState( [] ) ).toBe( STACK_STATE.NONE );
    } );

    it( 'returns RUNNING when every service is up and healthy', () => {
      expect( classifyStackState( [
        svc( 'running', 'healthy' ),
        svc( 'running', 'none' )
      ] ) ).toBe( STACK_STATE.RUNNING );
    } );

    it( 'returns PARTIAL when any service has failed (OUT-477 orphan)', () => {
      expect( classifyStackState( [
        svc( 'running', 'healthy' ),
        svc( 'exited', 'none' )
      ] ) ).toBe( STACK_STATE.PARTIAL );
    } );

    it( 'returns PARTIAL when services exist but some are still coming up', () => {
      expect( classifyStackState( [
        svc( 'running', 'healthy' ),
        svc( 'created', 'none' )
      ] ) ).toBe( STACK_STATE.PARTIAL );
    } );

    it( 'treats an unhealthy service as PARTIAL, not RUNNING', () => {
      expect( classifyStackState( [
        svc( 'running', 'healthy' ),
        svc( 'running', 'unhealthy' )
      ] ) ).toBe( STACK_STATE.PARTIAL );
    } );

    // `ps --all` reports exited containers, so a stack stopped by a reboot, a
    // `docker compose stop`, or a failed teardown still has rows. Nothing is
    // live, so this invocation would be the one starting it — that makes it an
    // owned fresh start, not an attach.
    it( 'returns NONE when every service is exited — an owned fresh start, not an attach', () => {
      expect( classifyStackState( [
        svc( 'exited', 'none' ),
        svc( 'exited', 'none' )
      ] ) ).toBe( STACK_STATE.NONE );
    } );

    it( 'returns NONE when containers are created but none have started', () => {
      expect( classifyStackState( [
        svc( 'created', 'none' ),
        svc( 'created', 'none' )
      ] ) ).toBe( STACK_STATE.NONE );
    } );

    it( 'still returns PARTIAL when at least one service is live', () => {
      expect( classifyStackState( [
        svc( 'running', 'healthy' ),
        svc( 'exited', 'none' )
      ] ) ).toBe( STACK_STATE.PARTIAL );
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
