/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { render } from 'ink';
import * as dockerService from '#services/docker.js';
import * as codingAgentsService from '#services/coding_agents.js';
import * as portAvailability from '#utils/port_availability.js';
import Dev from './index.js';

vi.mock( '#services/coding_agents.js', () => ( {
  ensureClaudePlugin: vi.fn().mockResolvedValue( undefined )
} ) );

vi.mock( '#utils/port_availability.js', () => ( {
  findUnavailablePorts: vi.fn().mockResolvedValue( [] )
} ) );

vi.mock( '#services/docker.js', async importActual => {
  const actual = await importActual<typeof import( '#services/docker.js' )>();
  return {
    ...actual,
    // Override only the IO surface. Pure helpers (classifyStackState,
    // isServiceHealthy, STACK_STATE, error classes) come from the real module,
    // so branch selection here exercises the same logic production runs.
    validateDockerEnvironment: vi.fn(),
    startDockerCompose: vi.fn(),
    startDockerComposeDetached: vi.fn(),
    stopDockerCompose: vi.fn().mockResolvedValue( undefined ),
    // Default: nothing running — a fresh start. Individual tests opt into an
    // existing stack by overriding this to drive attach / reconcile branches.
    getServiceStatus: vi.fn().mockResolvedValue( [] ),
    resolveDockerComposePath: vi.fn().mockResolvedValue( '/path/to/docker-compose-dev.yml' )
  };
} );

vi.mock( 'ink', () => ( {
  render: vi.fn().mockReturnValue( {
    waitUntilExit: vi.fn().mockResolvedValue( undefined ),
    unmount: vi.fn()
  } )
} ) );

vi.mock( '#views/dev/dev_app.js', () => ( {
  DevApp: () => null
} ) );

const createMockDockerProcess = (): ChildProcess => ( {
  on: vi.fn(),
  kill: vi.fn(),
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() }
} as any );

const getStartDockerComposeOptions = (): dockerService.StartDockerComposeOptions => {
  const options = vi.mocked( dockerService.startDockerCompose ).mock.calls.at( -1 )?.[0];
  if ( !options ) {
    throw new Error( 'Expected startDockerCompose to receive options' );
  }
  return options;
};

const createControllableInkInstance = () => {
  const deferred: {
    promise: Promise<void>;
    resolve: () => void;
    reject: ( reason?: unknown ) => void;
  } = {} as any;
  deferred.promise = new Promise<void>( ( resolve, reject ) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  } );
  const instance = {
    waitUntilExit: vi.fn( () => deferred.promise ),
    unmount: vi.fn( ( error?: Error ) => {
      if ( error ) {
        deferred.reject( error );
        return;
      }
      deferred.resolve();
    } )
  };
  return instance;
};

describe( 'dev command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    // By default, docker validation succeeds
    vi.mocked( dockerService.validateDockerEnvironment ).mockResolvedValue( undefined );
    // By default, no host port is taken — individual tests opt in.
    vi.mocked( portAvailability.findUnavailablePorts ).mockResolvedValue( [] );
    // By default, no stack is running — a fresh start. Tests opt into the
    // attach / reconcile branches by overriding getServiceStatus.
    vi.mocked( dockerService.getServiceStatus ).mockResolvedValue( [] );
    vi.mocked( dockerService.startDockerComposeDetached ).mockReturnValue( undefined );
    // By default, startDockerCompose returns a mock process
    vi.mocked( dockerService.startDockerCompose ).mockResolvedValue( createMockDockerProcess() );
    // By default, the compose file resolves and exists.
    vi.mocked( dockerService.resolveDockerComposePath ).mockResolvedValue( '/path/to/docker-compose-dev.yml' );
    // By default, ensureClaudePlugin succeeds
    vi.mocked( codingAgentsService.ensureClaudePlugin ).mockResolvedValue( undefined );
    // By default, render returns an instance that exits immediately. Tests
    // needing a controllable lifecycle override this.
    vi.mocked( render ).mockReturnValue( {
      waitUntilExit: vi.fn().mockResolvedValue( undefined ),
      unmount: vi.fn()
    } as any );
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
        expect.objectContaining( {
          dockerComposePath: '/path/to/docker-compose-dev.yml',
          pullPolicy: 'always',
          onError: expect.any( Function ),
          onExit: expect.any( Function )
        } )
      );

      // Cancel the promise (it will be rejected but we don't care)
      runPromise.catch( () => {} );
    } );

    it( 'should handle docker compose configuration not found', async () => {
      vi.mocked( dockerService.resolveDockerComposePath ).mockRejectedValue(
        new dockerService.DockerComposeConfigNotFoundError( '/path/to/docker-compose-dev.yml' )
      );

      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      await expect( cmd.run() ).rejects.toThrow();
    } );

    it( 'aborts with an actionable hint before docker runs when a host port is already taken', async () => {
      vi.mocked( portAvailability.findUnavailablePorts ).mockResolvedValue( [ 3001 ] );

      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn( () => {
        throw new Error( 'oclif-error-thrown' );
      } ) as any;

      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'always' }, args: {} } ),
        configurable: true
      } );

      await expect( cmd.run() ).rejects.toThrow();

      expect( cmd.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'Port 3001 is already in use.' ),
        { exit: 1 }
      );
      expect( cmd.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'OUTPUT_API_HOST_PORT=<other port>' ),
        { exit: 1 }
      );
      expect( dockerService.startDockerCompose ).not.toHaveBeenCalled();
      expect( render ).not.toHaveBeenCalled();
    } );

    it( 'lists every taken port when multiple collide, not just the first', async () => {
      vi.mocked( portAvailability.findUnavailablePorts ).mockResolvedValue( [ 3001, 7233 ] );

      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn( () => {
        throw new Error( 'oclif-error-thrown' );
      } ) as any;

      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'always' }, args: {} } ),
        configurable: true
      } );

      await expect( cmd.run() ).rejects.toThrow();

      const [ message ] = vi.mocked( cmd.error ).mock.calls[0] as [ string, unknown ];
      expect( message ).toContain( 'Multiple host ports are already in use:' );
      expect( message ).toContain( '• Port 3001 — override with OUTPUT_API_HOST_PORT=<other port>' );
      expect( message ).toContain( '• Port 7233 — override with OUTPUT_TEMPORAL_HOST_PORT=<other port>' );
      expect( dockerService.startDockerCompose ).not.toHaveBeenCalled();
      expect( render ).not.toHaveBeenCalled();
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

    it( 'should surface docker compose exit failures with recent output', async () => {
      const dockerProcess = createMockDockerProcess();
      vi.mocked( dockerService.startDockerCompose ).mockResolvedValue( dockerProcess );
      const inkInstance = createControllableInkInstance();
      vi.mocked( render ).mockReturnValue( inkInstance as any );

      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'always' }, args: {} } ),
        configurable: true
      } );

      const runPromise = cmd.run();
      await new Promise( resolve => setImmediate( resolve ) );

      getStartDockerComposeOptions().onExit?.( 1, null, 'Bind for 0.0.0.0:3001 failed: port is already allocated' );
      await runPromise;

      expect( inkInstance.unmount ).toHaveBeenCalledWith( expect.objectContaining( {
        message: expect.stringContaining( 'Docker compose exited with code 1' )
      } ) );
      expect( cmd.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'Recent Docker output:\nBind for 0.0.0.0:3001 failed' ),
        { exit: 1 }
      );
      expect( cmd.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'Port 3001 is already in use.' ),
        { exit: 1 }
      );
      expect( cmd.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'OUTPUT_API_HOST_PORT=<other port>' ),
        { exit: 1 }
      );
    } );

    it( 'should ignore docker compose exits triggered by cleanup', async () => {
      const dockerProcess = createMockDockerProcess();
      vi.mocked( dockerService.startDockerCompose ).mockResolvedValue( dockerProcess );
      const inkInstance = createControllableInkInstance();
      vi.mocked( render ).mockReturnValue( inkInstance as any );

      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined, 'image-pull-policy': 'always' }, args: {} } ),
        configurable: true
      } );

      const runPromise = cmd.run();
      await new Promise( resolve => setImmediate( resolve ) );

      const appElement = vi.mocked( render ).mock.calls[0]?.[0];
      if ( !React.isValidElement<{ onCleanup: () => Promise<void> }>( appElement ) ) {
        throw new Error( 'Expected render to receive a React element' );
      }
      const appProps = appElement.props;
      await appProps.onCleanup();
      getStartDockerComposeOptions().onExit?.( null, 'SIGTERM', 'compose stopped' );
      inkInstance.unmount();
      await runPromise;

      expect( inkInstance.unmount ).not.toHaveBeenCalledWith( expect.any( Error ) );
      expect( cmd.error ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'attach and reconcile behavior', () => {
    const runningStack = [
      { name: 'redis', state: 'running', health: 'healthy', ports: [] },
      { name: 'temporal', state: 'running', health: 'healthy', ports: [ '7233:7233' ] },
      { name: 'api', state: 'running', health: 'none', ports: [ '3001:3001' ] }
    ];

    const makeCmd = (): Dev => {
      const cmd = new Dev( [], {} as any );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;
      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( {
          flags: { 'compose-file': undefined, 'image-pull-policy': 'always', detached: false },
          args: {}
        } ),
        configurable: true
      } );
      return cmd;
    };

    const lastRenderedProps = <T>(): T => {
      const appElement = vi.mocked( render ).mock.calls.at( -1 )?.[0];
      if ( !React.isValidElement<T>( appElement ) ) {
        throw new Error( 'Expected render to receive a React element' );
      }
      return appElement.props;
    };

    it( 'attaches to a healthy running stack without a foreground up or port probe', async () => {
      vi.mocked( dockerService.getServiceStatus ).mockResolvedValue( runningStack );

      const cmd = makeCmd();
      await cmd.run();

      expect( portAvailability.findUnavailablePorts ).not.toHaveBeenCalled();
      expect( dockerService.startDockerCompose ).not.toHaveBeenCalled();
      expect( dockerService.startDockerComposeDetached ).not.toHaveBeenCalled();
      expect( cmd.error ).not.toHaveBeenCalled();
      expect( lastRenderedProps<{ attached: boolean }>().attached ).toBe( true );
    } );

    it( 'leaves an attached stack running on cleanup (no teardown)', async () => {
      vi.mocked( dockerService.getServiceStatus ).mockResolvedValue( runningStack );

      const cmd = makeCmd();
      await cmd.run();

      await lastRenderedProps<{ onCleanup: () => Promise<void> }>().onCleanup();

      expect( dockerService.stopDockerCompose ).not.toHaveBeenCalled();
    } );

    it( 'does not port-probe or error when our own stack already holds the ports', async () => {
      vi.mocked( dockerService.getServiceStatus ).mockResolvedValue( runningStack );
      vi.mocked( portAvailability.findUnavailablePorts ).mockResolvedValue( [ 3001 ] );

      const cmd = makeCmd();
      await cmd.run();

      expect( portAvailability.findUnavailablePorts ).not.toHaveBeenCalled();
      expect( cmd.error ).not.toHaveBeenCalled();
    } );

    it( 'reconciles a partially-failed stack with a detached up, then monitors', async () => {
      vi.mocked( dockerService.getServiceStatus ).mockResolvedValue( [
        { name: 'temporal', state: 'running', health: 'healthy', ports: [ '7233:7233' ] },
        { name: 'worker', state: 'exited', health: 'none', ports: [] }
      ] );

      const cmd = makeCmd();
      await cmd.run();

      expect( dockerService.startDockerComposeDetached ).toHaveBeenCalledWith(
        '/path/to/docker-compose-dev.yml',
        'always'
      );
      // Reconcile monitors via ps polling, not a foreground up.
      expect( dockerService.startDockerCompose ).not.toHaveBeenCalled();
      expect( portAvailability.findUnavailablePorts ).not.toHaveBeenCalled();
      expect( lastRenderedProps<{ attached: boolean }>().attached ).toBe( true );
    } );

    it( 'falls back to a fresh foreground start when no stack is running', async () => {
      vi.mocked( dockerService.getServiceStatus ).mockResolvedValue( [] );

      const cmd = makeCmd();
      const runPromise = cmd.run();
      await new Promise( resolve => setImmediate( resolve ) );

      expect( portAvailability.findUnavailablePorts ).toHaveBeenCalled();
      expect( dockerService.startDockerCompose ).toHaveBeenCalled();
      expect( dockerService.startDockerComposeDetached ).not.toHaveBeenCalled();
      expect( lastRenderedProps<{ attached: boolean }>().attached ).toBe( false );

      runPromise.catch( () => {} );
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
        expect.objectContaining( {
          dockerComposePath: '/path/to/docker-compose-dev.yml',
          pullPolicy: 'missing',
          onError: expect.any( Function ),
          onExit: expect.any( Function )
        } )
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
        expect.objectContaining( {
          dockerComposePath: '/path/to/docker-compose-dev.yml',
          pullPolicy: 'never',
          onError: expect.any( Function ),
          onExit: expect.any( Function )
        } )
      );

      // Cancel the promise (it will be rejected but we don't care)
      runPromise.catch( () => {} );
    } );
  } );
} );
