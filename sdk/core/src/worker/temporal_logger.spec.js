import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  defaultLoggerMock,
  logMock,
  makeTelemetryFilterStringMock,
  runtimeInstallMock
} = vi.hoisted( () => ( {
  defaultLoggerMock: vi.fn( function ( level, callback ) {
    this.level = level;
    this.callback = callback;
  } ),
  logMock: { log: vi.fn() },
  makeTelemetryFilterStringMock: vi.fn().mockReturnValue( 'temporal-filter' ),
  runtimeInstallMock: vi.fn()
} ) );

vi.mock( '@temporalio/worker', () => ( {
  DefaultLogger: defaultLoggerMock,
  makeTelemetryFilterString: makeTelemetryFilterStringMock,
  Runtime: { install: runtimeInstallMock }
} ) );
vi.mock( '#logger', () => ( { createChildLogger: () => logMock } ) );

import { setupTemporalLogger } from './temporal_logger.js';

describe( 'setupTemporalLogger', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.stubEnv( 'OUTPUT_TEMPORAL_LOG_LEVEL', undefined );
  } );

  afterEach( () => {
    vi.unstubAllEnvs();
  } );

  it( 'forwards Temporal SDK and Core logs through the application logger', () => {
    setupTemporalLogger();

    expect( makeTelemetryFilterStringMock ).toHaveBeenCalledWith( { core: 'INFO', other: 'INFO' } );
    expect( defaultLoggerMock ).toHaveBeenCalledWith( 'INFO', expect.any( Function ) );
    expect( runtimeInstallMock ).toHaveBeenCalledWith( {
      logger: expect.any( defaultLoggerMock ),
      telemetryOptions: {
        logging: {
          forward: {},
          filter: 'temporal-filter'
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

  it( 'applies a case-insensitive configured log level to SDK and Core logs', () => {
    vi.stubEnv( 'OUTPUT_TEMPORAL_LOG_LEVEL', 'debug' );

    setupTemporalLogger();

    expect( defaultLoggerMock ).toHaveBeenCalledWith( 'DEBUG', expect.any( Function ) );
    expect( makeTelemetryFilterStringMock ).toHaveBeenCalledWith( { core: 'DEBUG', other: 'DEBUG' } );
  } );

  it.each( [ 'Activity failed', 'Workflow failed' ] )( 'omits redundant "%s" events', message => {
    setupTemporalLogger();
    const [ entryCallback ] = defaultLoggerMock.mock.calls[0].slice( 1 );

    entryCallback( { level: 'WARN', message, meta: { error: new Error( 'failed' ) } } );

    expect( logMock.log ).not.toHaveBeenCalled();
  } );
} );
