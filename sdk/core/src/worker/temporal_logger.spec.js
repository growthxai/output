import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  configsMock,
  defaultLoggerMock,
  logMock,
  runtimeInstallMock
} = vi.hoisted( () => ( {
  configsMock: { temporalLogLevel: 'INFO' },
  defaultLoggerMock: vi.fn( function ( level, callback ) {
    this.level = level;
    this.callback = callback;
  } ),
  logMock: { log: vi.fn() },
  runtimeInstallMock: vi.fn()
} ) );

vi.mock( './configs.js', () => ( {
  get temporalLogLevel() {
    return configsMock.temporalLogLevel;
  }
} ) );
// The real error class, so the demotion is checked against what Temporal actually throws
vi.mock( '@temporalio/worker', async importOriginal => ( {
  DefaultLogger: defaultLoggerMock,
  GracefulShutdownPeriodExpiredError: ( await importOriginal() ).GracefulShutdownPeriodExpiredError,
  Runtime: { install: runtimeInstallMock }
} ) );
vi.mock( '#logger', () => ( { createChildLogger: () => logMock } ) );
vi.mock( '#helpers/error_serializer', () => ( {
  serializeError: error => ( { name: error.name, message: error.message } )
} ) );

import { GracefulShutdownPeriodExpiredError } from '@temporalio/worker';
import { setupTemporalLogger } from './temporal_logger.js';

describe( 'setupTemporalLogger', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    configsMock.temporalLogLevel = 'INFO';
  } );

  it( 'forwards Temporal SDK and Core logs through the application logger', () => {
    setupTemporalLogger();

    expect( defaultLoggerMock ).toHaveBeenCalledWith( 'INFO', expect.any( Function ) );
    expect( runtimeInstallMock ).toHaveBeenCalledWith( {
      logger: expect.any( defaultLoggerMock ),
      telemetryOptions: {
        logging: {
          forward: {},
          filter: { core: 'INFO', other: 'INFO' }
        }
      }
    } );

    const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );
    entryCallback( { level: 'WARN', message: 'Worker warning', meta: { taskQueue: 'default' } } );

    expect( logMock.log ).toHaveBeenCalledWith( 'warn', 'Worker warning', { taskQueue: 'default' } );
  } );

  it.each( [
    [ 'TRACE', 'debug' ],
    [ 'DEBUG', 'debug' ],
    [ 'INFO', 'info' ],
    [ 'WARN', 'warn' ],
    [ 'ERROR', 'error' ]
  ] )( 'maps Temporal %s logs to the %s application level', ( temporalLevel, internalLevel ) => {
    setupTemporalLogger();
    const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

    entryCallback( { level: temporalLevel, message: `${temporalLevel} event`, meta: { source: 'test' } } );

    expect( logMock.log ).toHaveBeenCalledWith( internalLevel, `${temporalLevel} event`, { source: 'test' } );
  } );

  it( 'applies the configured log level to SDK and Core logs', () => {
    configsMock.temporalLogLevel = 'DEBUG';

    setupTemporalLogger();

    expect( defaultLoggerMock ).toHaveBeenCalledWith( 'DEBUG', expect.any( Function ) );
    expect( runtimeInstallMock ).toHaveBeenCalledWith( expect.objectContaining( {
      telemetryOptions: { logging: { forward: {}, filter: { core: 'DEBUG', other: 'DEBUG' } } }
    } ) );
  } );

  it( 'serializes Error values in the meta and keeps other values as they are', () => {
    setupTemporalLogger();
    const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

    entryCallback( { level: 'ERROR', message: 'Worker failed', meta: { error: new TypeError( 'boom' ), taskQueue: 'default' } } );

    expect( logMock.log ).toHaveBeenCalledWith( 'error', 'Worker failed', {
      error: { name: 'TypeError', message: 'boom' },
      taskQueue: 'default'
    } );
  } );

  it( 'logs entries without meta', () => {
    setupTemporalLogger();
    const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

    entryCallback( { level: 'INFO', message: 'No meta' } );

    expect( logMock.log ).toHaveBeenCalledWith( 'info', 'No meta', undefined );
  } );

  it.each( [ 'Activity failed', 'Workflow failed' ] )( 'omits redundant "%s" events', message => {
    setupTemporalLogger();
    const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

    entryCallback( { level: 'WARN', message, meta: { error: new Error( 'failed' ) } } );

    expect( logMock.log ).not.toHaveBeenCalled();
  } );

  describe( 'when the shutdown force time expires', () => {
    const buildForcedEntry = () => {
      const error = new GracefulShutdownPeriodExpiredError( 'Timed out waiting for activities to finish' );
      return { error, entry: { level: 'ERROR', message: 'Worker failed', meta: { error } } };
    };

    it( 'logs Temporal Worker failed as a warning instead of an error', () => {
      const { error, entry } = buildForcedEntry();
      setupTemporalLogger();
      const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

      entryCallback( entry );

      expect( logMock.log ).toHaveBeenCalledOnce();
      expect( logMock.log ).toHaveBeenCalledWith( 'warn', 'Worker failed', {
        error: { name: error.name, message: error.message }
      } );
    } );

    it( 'still logs the warning when the configured level is WARN', () => {
      configsMock.temporalLogLevel = 'WARN';
      setupTemporalLogger();
      const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

      entryCallback( buildForcedEntry().entry );

      expect( logMock.log ).toHaveBeenCalledWith( 'warn', 'Worker failed', expect.any( Object ) );
    } );

    it( 'drops the entry when the configured level is ERROR, since a warning is below it', () => {
      configsMock.temporalLogLevel = 'ERROR';
      setupTemporalLogger();
      const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

      entryCallback( buildForcedEntry().entry );

      expect( logMock.log ).not.toHaveBeenCalled();
    } );

    it.each( [ 'INFO', 'DEBUG', 'TRACE' ] )( 'logs the warning when the configured level is %s', level => {
      configsMock.temporalLogLevel = level;
      setupTemporalLogger();
      const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

      entryCallback( buildForcedEntry().entry );

      expect( logMock.log ).toHaveBeenCalledWith( 'warn', 'Worker failed', expect.any( Object ) );
    } );

    it( 'keeps any other Worker failed error at the error level, even when the level is ERROR', () => {
      configsMock.temporalLogLevel = 'ERROR';
      setupTemporalLogger();
      const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

      entryCallback( { level: 'ERROR', message: 'Worker failed', meta: { error: new TypeError( 'boom' ) } } );

      expect( logMock.log ).toHaveBeenCalledWith( 'error', 'Worker failed', {
        error: { name: 'TypeError', message: 'boom' }
      } );
    } );

    it( 'does not demote an unrelated error that only shares the class name', () => {
      class GracefulShutdownPeriodExpiredLookalike extends Error {}
      Object.defineProperty( GracefulShutdownPeriodExpiredLookalike, 'name', { value: GracefulShutdownPeriodExpiredError.name } );
      setupTemporalLogger();
      const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

      entryCallback( { level: 'ERROR', message: 'Worker failed', meta: { error: new GracefulShutdownPeriodExpiredLookalike( 'other' ) } } );

      expect( logMock.log ).toHaveBeenCalledWith( 'error', 'Worker failed', expect.any( Object ) );
    } );

    it( 'demotes the error from another copy of the Temporal SDK, which carries the same marker but not the same class', () => {
      const error = Object.assign( new Error( 'Timed out waiting for activities to finish' ), {
        [Symbol.for( '__temporal_isGracefulShutdownPeriodExpiredError' )]: true
      } );
      setupTemporalLogger();
      const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

      entryCallback( { level: 'ERROR', message: 'Worker failed', meta: { error } } );

      expect( logMock.log ).toHaveBeenCalledWith( 'warn', 'Worker failed', expect.any( Object ) );
    } );

    it( 'does not treat a meta without an error as a forced shutdown', () => {
      configsMock.temporalLogLevel = 'ERROR';
      setupTemporalLogger();
      const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

      entryCallback( { level: 'ERROR', message: 'Worker failed', meta: { error: 'timed out' } } );

      expect( logMock.log ).toHaveBeenCalledWith( 'error', 'Worker failed', { error: 'timed out' } );
    } );
  } );
} );
