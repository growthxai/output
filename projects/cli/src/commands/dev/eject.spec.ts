/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import DevEject from './eject.js';

vi.mock( 'node:fs/promises' );

describe( 'dev eject command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'command structure', () => {
    it( 'should have correct description', () => {
      expect( DevEject.description ).toBeDefined();
      expect( DevEject.description ).toContain( 'Eject' );
      expect( DevEject.description ).toContain( 'Docker Compose' );
    } );

    it( 'should have examples', () => {
      expect( DevEject.examples ).toBeDefined();
      expect( Array.isArray( DevEject.examples ) ).toBe( true );
      expect( DevEject.examples.length ).toBeGreaterThan( 0 );
    } );

    it( 'should have no required arguments', () => {
      expect( DevEject.args ).toBeDefined();
      expect( Object.keys( DevEject.args ) ).toHaveLength( 0 );
    } );

    it( 'should have output and force flags defined', () => {
      expect( DevEject.flags ).toBeDefined();
      expect( DevEject.flags.output ).toBeDefined();
      expect( DevEject.flags.output.description ).toContain( 'Output path' );
      expect( DevEject.flags.output.required ).toBe( false );
      expect( DevEject.flags.output.char ).toBe( 'o' );
      expect( DevEject.flags.output.default ).toBe( 'docker-compose.yml' );

      expect( DevEject.flags.force ).toBeDefined();
      expect( DevEject.flags.force.description ).toContain( 'Overwrite' );
      expect( DevEject.flags.force.required ).toBe( false );
      expect( DevEject.flags.force.char ).toBe( 'f' );
      expect( DevEject.flags.force.default ).toBe( false );
    } );
  } );

  describe( 'command instantiation', () => {
    it( 'should be instantiable', () => {
      const cmd = new DevEject( [], {} as any );
      expect( cmd ).toBeInstanceOf( DevEject );
    } );

    it( 'should have a run method', () => {
      const cmd = new DevEject( [], {} as any );
      expect( cmd.run ).toBeDefined();
      expect( typeof cmd.run ).toBe( 'function' );
    } );
  } );

  describe( 'file ejection', () => {
    it( 'should eject docker-compose file to default location', async () => {
      const config = {
        runHook: vi.fn().mockResolvedValue( { failures: [], successes: [] } )
      } as any;
      const cmd = new DevEject( [], config );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      const mockDockerComposeContent = 'name: output-sdk\nservices:\n  redis:\n    image: redis:8-alpine';

      // Mock source file exists and can be read
      vi.mocked( fs.access ).mockImplementation( path => {
        if ( path.toString().includes( 'assets/docker/docker-compose-dev.yml' ) ) {
          return Promise.resolve();
        }
        // Destination file doesn't exist
        return Promise.reject( new Error( 'File not found' ) );
      } );

      vi.mocked( fs.readFile ).mockResolvedValue( mockDockerComposeContent );
      vi.mocked( fs.writeFile ).mockResolvedValue();

      await cmd.run();

      expect( fs.readFile ).toHaveBeenCalled();
      expect( fs.writeFile ).toHaveBeenCalledWith(
        expect.stringContaining( 'docker-compose.yml' ),
        mockDockerComposeContent,
        'utf-8'
      );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'SUCCESS!' ) );
    } );

    it( 'should error if destination file exists and force flag is not set', async () => {
      const config = {
        runHook: vi.fn().mockResolvedValue( { failures: [], successes: [] } )
      } as any;
      const cmd = new DevEject( [], config );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn().mockImplementation( msg => {
        throw new Error( msg );
      } ) as any;

      // Mock both source and destination files exist
      vi.mocked( fs.access ).mockResolvedValue();

      await expect( cmd.run() ).rejects.toThrow( 'File already exists' );
      expect( cmd.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'File already exists' ),
        { exit: 1 }
      );
    } );

    it( 'should overwrite file if force flag is set', async () => {
      const config = {
        runHook: vi.fn().mockResolvedValue( { failures: [], successes: [] } )
      } as any;
      const cmd = new DevEject( [ '--force' ], config );
      cmd.log = vi.fn() as any;
      cmd.error = vi.fn() as any;

      const mockDockerComposeContent = 'name: output-sdk\nservices:\n  redis:\n    image: redis:8-alpine';

      // Mock both source and destination files exist
      vi.mocked( fs.access ).mockResolvedValue();
      vi.mocked( fs.readFile ).mockResolvedValue( mockDockerComposeContent );
      vi.mocked( fs.writeFile ).mockResolvedValue();

      await cmd.run();

      expect( fs.readFile ).toHaveBeenCalled();
      expect( fs.writeFile ).toHaveBeenCalledWith(
        expect.stringContaining( 'docker-compose.yml' ),
        mockDockerComposeContent,
        'utf-8'
      );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'SUCCESS!' ) );
    } );
  } );
} );
