/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dockerService from '#services/docker.js';
import DevDown from './down.js';

vi.mock( '#services/docker.js', () => ( {
  validateDockerEnvironment: vi.fn(),
  stopDockerCompose: vi.fn().mockResolvedValue( undefined ),
  resolveDockerComposePath: vi.fn().mockResolvedValue( '/path/to/docker-compose-dev.yml' )
} ) );

const makeCmd = (): DevDown => {
  const cmd = new DevDown( [], {} as any );
  cmd.log = vi.fn() as any;
  cmd.error = vi.fn() as any;
  Object.defineProperty( cmd, 'parse', {
    value: vi.fn().mockResolvedValue( { flags: { 'compose-file': undefined }, args: {} } ),
    configurable: true
  } );
  return cmd;
};

describe( 'dev down command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( dockerService.validateDockerEnvironment ).mockReturnValue( undefined );
    vi.mocked( dockerService.stopDockerCompose ).mockResolvedValue( undefined );
    vi.mocked( dockerService.resolveDockerComposePath ).mockResolvedValue( '/path/to/docker-compose-dev.yml' );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'command structure', () => {
    it( 'should have a description mentioning stopping services', () => {
      expect( DevDown.description ).toBeDefined();
      expect( DevDown.description ).toContain( 'Stop' );
    } );

    it( 'should have no required arguments', () => {
      expect( Object.keys( DevDown.args ) ).toHaveLength( 0 );
    } );

    it( 'should have a compose-file flag', () => {
      expect( DevDown.flags['compose-file'] ).toBeDefined();
      expect( DevDown.flags['compose-file'].char ).toBe( 'f' );
    } );
  } );

  describe( 'run', () => {
    it( 'validates docker and stops the default stack', async () => {
      const cmd = makeCmd();
      await cmd.run();

      expect( dockerService.validateDockerEnvironment ).toHaveBeenCalled();
      expect( dockerService.stopDockerCompose ).toHaveBeenCalledWith( '/path/to/docker-compose-dev.yml' );
      expect( cmd.error ).not.toHaveBeenCalled();
    } );

    it( 'errors when the compose file is missing', async () => {
      vi.mocked( dockerService.resolveDockerComposePath ).mockRejectedValue( new Error( 'File not found' ) );

      const cmd = makeCmd();
      await expect( cmd.run() ).rejects.toThrow();
      expect( dockerService.stopDockerCompose ).not.toHaveBeenCalled();
    } );

    it( 'surfaces a teardown failure as an actionable error', async () => {
      vi.mocked( dockerService.stopDockerCompose ).mockRejectedValue( new Error( 'compose down failed' ) );
      const cmd = makeCmd();
      cmd.error = vi.fn( () => {
        throw new Error( 'oclif-error-thrown' );
      } ) as any;

      await expect( cmd.run() ).rejects.toThrow();
      expect( cmd.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'compose down failed' ),
        { exit: 1 }
      );
    } );
  } );
} );
