/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as projectScaffold from '#services/project_scaffold.js';
import { UserCancelledError } from '#types/errors.js';
import Init from './init.js';

vi.mock( '#services/project_scaffold.js' );

describe( 'init command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.mocked( projectScaffold.runInit ).mockResolvedValue( undefined );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'command structure', () => {
    it( 'should have correct description', () => {
      expect( Init.description ).toBeDefined();
      expect( Init.description ).toContain( 'scaffold' );
    } );

    it( 'should have correct examples', () => {
      expect( Init.examples ).toBeDefined();
      expect( Array.isArray( Init.examples ) ).toBe( true );
      expect( Init.examples.length ).toBeGreaterThan( 0 );
    } );

    it( 'should have an optional folderName argument', () => {
      expect( Init.args ).toBeDefined();
      expect( Init.args.folderName ).toBeDefined();
      expect( Init.args.folderName.required ).toBe( false );
    } );
  } );

  describe( 'command execution', () => {
    const createTestCommand = (
      args: string[] = [],
      flags: Record<string, unknown> = {},
      parsedArgs: Record<string, unknown> = {}
    ) => {
      const cmd = new Init( args, {} as any );
      cmd.log = vi.fn();
      cmd.warn = vi.fn();
      cmd.error = vi.fn() as any;
      Object.defineProperty( cmd, 'parse', {
        value: vi.fn().mockResolvedValue( {
          args: { folderName: undefined, ...parsedArgs },
          flags: { 'skip-env': false, ...flags }
        } ),
        configurable: true
      } );
      return cmd;
    };

    it( 'should be instantiable', () => {
      const cmd = createTestCommand();
      expect( cmd ).toBeInstanceOf( Init );
    } );

    it( 'should have a run method', () => {
      const cmd = createTestCommand();
      expect( cmd.run ).toBeDefined();
      expect( typeof cmd.run ).toBe( 'function' );
    } );

    it( 'should call runInit with skip-env flag and folder name', async () => {
      const cmd = createTestCommand();
      await cmd.run();

      expect( projectScaffold.runInit ).toHaveBeenCalledWith( false, undefined );
    } );

    it( 'should handle UserCancelledError', async () => {
      const error = new UserCancelledError();
      vi.mocked( projectScaffold.runInit ).mockRejectedValue( error );

      const cmd = createTestCommand();
      await cmd.run();

      expect( cmd.log ).toHaveBeenCalledWith( 'Init cancelled by user.' );
      expect( cmd.error ).not.toHaveBeenCalled();
    } );

    it( 'should handle other errors by passing error message', async () => {
      // runInit now handles cleanup internally and throws Error with message
      const testError = new Error( 'Failed to create project' );
      vi.mocked( projectScaffold.runInit ).mockRejectedValue( testError );

      const cmd = createTestCommand();
      await cmd.run();

      expect( cmd.error ).toHaveBeenCalledWith( 'Failed to create project' );
    } );

    it( 'should pass error message to this.error', async () => {
      const testError = new Error( 'Folder already exists' );
      vi.mocked( projectScaffold.runInit ).mockRejectedValue( testError );

      const cmd = createTestCommand();
      await cmd.run();

      expect( cmd.error ).toHaveBeenCalledWith( 'Folder already exists' );
    } );

    it( 'should successfully complete project creation', async () => {
      const cmd = createTestCommand();
      await cmd.run();

      expect( projectScaffold.runInit ).toHaveBeenCalled();
      expect( cmd.error ).not.toHaveBeenCalled();
    } );

    it( 'should pass skip-env flag to runInit when --skip-env is provided', async () => {
      const cmd = createTestCommand( [], { 'skip-env': true } );
      await cmd.run();

      expect( projectScaffold.runInit ).toHaveBeenCalledWith( true, undefined );
    } );

    it( 'should pass folder name to runInit when provided', async () => {
      const cmd = createTestCommand( [], {}, { folderName: 'my-project' } );
      await cmd.run();

      expect( projectScaffold.runInit ).toHaveBeenCalledWith( false, 'my-project' );
    } );
  } );
} );
