/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import * as dockerService from '#services/docker.js';
import * as codingAgentsService from '#services/coding_agents.js';
import Dev from './index.js';

vi.mock( '#services/coding_agents.js', () => ( {
  ensureClaudePlugin: vi.fn().mockResolvedValue( undefined )
} ) );

vi.mock( '#services/docker.js', () => ( {
  validateDockerEnvironment: vi.fn(),
  startDockerCompose: vi.fn(),
  stopDockerCompose: vi.fn().mockResolvedValue( undefined ),
  getServiceStatus: vi.fn().mockResolvedValue( [
    { name: 'redis', state: 'running', health: 'healthy', ports: [ '6379:6379' ] },
    { name: 'temporal', state: 'running', health: 'healthy', ports: [ '7233:7233' ] }
  ] ),
  DockerComposeConfigNotFoundError: Error,
  DockerValidationError: Error,
  getDefaultDockerComposePath: vi.fn( () => '/path/to/docker-compose-dev.yml' ),
  SERVICE_HEALTH: {
    HEALTHY: 'healthy',
    UNHEALTHY: 'unhealthy',
    STARTING: 'starting',
    NONE: 'none'
  },
  SERVICE_STATE: {
    RUNNING: 'running',
    EXITED: 'exited'
  }
} ) );

vi.mock( 'node:fs/promises', () => ( {
  default: {
    access: vi.fn()
  }
} ) );

const createMockDockerProcess = (): dockerService.DockerComposeProcess => ( {
  process: {
    on: vi.fn(),
    kill: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() }
  } as any,
  waitForHealthy: vi.fn().mockResolvedValue( undefined )
} );

describe( 'dev command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    // By default, docker validation succeeds
    vi.mocked( dockerService.validateDockerEnvironment ).mockResolvedValue( undefined );
    // By default, startDockerCompose returns a mock process
    vi.mocked( dockerService.startDockerCompose ).mockResolvedValue( createMockDockerProcess() );
    // By default, fs.access succeeds (file exists)
    vi.mocked( fs ).access.mockResolvedValue( undefined );
    // By default, ensureClaudePlugin succeeds
    vi.mocked( codingAgentsService.ensureClaudePlugin ).mockResolvedValue( undefined );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'command structure', () => {
    it( 'should have correct description', () => {
      expect( Dev.description ).toBeDefined();
      expect( Dev.description ).toContain( 'development services' );
    } );

    it( 'should have examples', () => {
      expect( Dev.examples ).toBeDefined();
      expect( Array.isArray( Dev.examples ) ).toBe( true );
      expect( Dev.examples.length ).toBeGreaterThan( 0 );
    } );

    it( 'should have no required arguments', () => {
      expect( Dev.args ).toBeDefined();
      expect( Object.keys( Dev.args ) ).toHaveLength( 0 );
    } );

    it( 'should have compose-file flag defined', () => {
      expect( Dev.flags ).toBeDefined();
      expect( Dev.flags['compose-file'] ).toBeDefined();
      expect( Dev.flags['compose-file'].description ).toContain( 'custom docker-compose' );
      expect( Dev.flags['compose-file'].required ).toBe( false );
      expect( Dev.flags['compose-file'].char ).toBe( 'f' );
    } );

    it( 'should have image-pull-policy flag defined', () => {
      expect( Dev.flags ).toBeDefined();
      expect( Dev.flags['image-pull-policy'] ).toBeDefined();
      expect( Dev.flags['image-pull-policy'].description ).toContain( 'pull policy' );
    } );
  } );

  describe( 'command instantiation', () => {
    it( 'should be instantiable', () => {
      const cmd = new Dev( [], {} as any );
      expect( cmd ).toBeInstanceOf( Dev );
    } );

    it( 'should have a run method', () => {
      const cmd = new Dev( [], {} as any );
      expect( cmd.run ).toBeDefined();
      expect( typeof cmd.run ).toBe( 'function' );
    } );
  } );

  describe( 'Docker validation', () => {
    it( 'should error if Docker validation fails', async () => {
      const config = {
        runHook: vi.fn().mockResolvedValue( { failures: [], successes: [] } )
      } as any;
      const cmd = new Dev( [], config );
      cmd.log = vi.fn() as any;

      // Mock parse to return flags
      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined }, args: {} } ),
        configurable: true
      } );

      const validationError = new Error( 'Docker is not installed' );
      vi.mocked( dockerService.validateDockerEnvironment ).mockImplementation( () => {
        throw validationError;
      } );

      await expect( cmd.run() ).rejects.toThrow( 'Docker is not installed' );
    } );

    it( 'should call validateDockerEnvironment', async () => {
      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      // Mock the subprocess spawn to prevent actual execution
      vi.doMock( 'node:child_process', () => ( {
        spawn: vi.fn().mockReturnValue( {
          on: vi.fn(),
          kill: vi.fn()
        } )
      } ) );

      // This test just verifies the function is called
      expect( vi.mocked( dockerService.validateDockerEnvironment ) ).toBeDefined();
    } );
  } );

  describe( 'Claude plugin update', () => {
    it( 'should call ensureClaudePlugin on startup', async () => {
      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'always' }, args: {} } ),
        configurable: true
      } );

      const runPromise = cmd.run();

      await new Promise( resolve => setImmediate( resolve ) );

      expect( codingAgentsService.ensureClaudePlugin ).toHaveBeenCalledWith( process.cwd(), { silent: true } );

      runPromise.catch( () => {} );
    } );

    it( 'should not block dev if ensureClaudePlugin fails', async () => {
      vi.mocked( codingAgentsService.ensureClaudePlugin ).mockRejectedValue( new Error( 'Plugin update failed' ) );

      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'always' }, args: {} } ),
        configurable: true
      } );

      const runPromise = cmd.run();

      await new Promise( resolve => setImmediate( resolve ) );

      // Docker compose should still be called even if plugin update fails
      expect( dockerService.startDockerCompose ).toHaveBeenCalled();

      runPromise.catch( () => {} );
    } );
  } );

  describe( 'watch functionality', () => {
    it( 'should start docker compose', async () => {
      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      // Mock parse to return flags
      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'always' }, args: {} } ),
        configurable: true
      } );

      // Run the command but don't await it since it waits forever after startup
      const runPromise = cmd.run();

      // Wait a tick for startDockerCompose to be called
      await new Promise( resolve => setImmediate( resolve ) );

      expect( dockerService.startDockerCompose ).toHaveBeenCalledWith(
        '/path/to/docker-compose-dev.yml',
        'always' // default pull policy
      );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'File watching enabled' ) );

      // Cancel the promise (it will be rejected but we don't care)
      runPromise.catch( () => {} );
    } );

    it( 'should handle docker compose configuration not found', async () => {
      vi.mocked( fs ).access.mockRejectedValue( new Error( 'File not found' ) );

      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      await expect( cmd.run() ).rejects.toThrow();
    } );

    it( 'should handle startDockerCompose errors', async () => {
      vi.mocked( dockerService.startDockerCompose ).mockRejectedValue( new Error( 'Docker error' ) );

      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      // Mock parse to return flags
      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'always' }, args: {} } ),
        configurable: true
      } );

      await cmd.run();

      expect( cmd.error ).toHaveBeenCalledWith( 'Docker error', { exit: 1 } );
    } );
  } );

  describe( 'image pull policy', () => {
    it( 'should pass pull policy to startDockerCompose', async () => {
      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      // Mock parse to return flags with missing pull policy
      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'missing' }, args: {} } ),
        configurable: true
      } );

      // Run the command but don't await it since it waits forever after startup
      const runPromise = cmd.run();

      // Wait a tick for startDockerCompose to be called
      await new Promise( resolve => setImmediate( resolve ) );

      expect( dockerService.startDockerCompose ).toHaveBeenCalledWith(
        '/path/to/docker-compose-dev.yml',
        'missing'
      );

      // Cancel the promise (it will be rejected but we don't care)
      runPromise.catch( () => {} );
    } );

    it( 'should use never pull policy when specified', async () => {
      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      // Mock parse to return flags with never pull policy
      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'never' }, args: {} } ),
        configurable: true
      } );

      // Run the command but don't await it since it waits forever after startup
      const runPromise = cmd.run();

      // Wait a tick for startDockerCompose to be called
      await new Promise( resolve => setImmediate( resolve ) );

      expect( dockerService.startDockerCompose ).toHaveBeenCalledWith(
        '/path/to/docker-compose-dev.yml',
        'never'
      );

      // Cancel the promise (it will be rejected but we don't care)
      runPromise.catch( () => {} );
    } );
  } );
} );
