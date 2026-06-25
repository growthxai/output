import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ACTIVITY_LOGGER_SYMBOL } from '#consts';

const workflowLogMock = vi.fn();
const proxySinksMock = vi.fn( () => ( {
  workflow: {
    log: workflowLogMock
  }
} ) );
const inWorkflowContextMock = vi.fn( () => false );

vi.mock( '@temporalio/workflow', () => ( {
  inWorkflowContext: inWorkflowContextMock,
  proxySinks: proxySinksMock
} ) );

const logLevels = [
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly'
];

const consoleMethodsByLevel = {
  error: 'error',
  warn: 'warn',
  info: 'info',
  http: 'log',
  verbose: 'log',
  debug: 'debug',
  silly: 'log'
};

const loadLogger = async () => import( './logger.js' );

describe( 'interface/logger', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    inWorkflowContextMock.mockReturnValue( false );
    delete globalThis[ACTIVITY_LOGGER_SYMBOL];
  } );

  afterEach( () => {
    delete globalThis[ACTIVITY_LOGGER_SYMBOL];
    vi.restoreAllMocks();
  } );

  it( 'proxies sinks once when the module is loaded', async () => {
    await loadLogger();

    expect( proxySinksMock ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'logs every level through workflow sinks inside workflow context', async () => {
    const logger = await loadLogger();
    inWorkflowContextMock.mockReturnValue( true );

    logLevels.forEach( level => {
      logger[level]( `${level} message`, { requestId: level } );
    } );

    logLevels.forEach( ( level, index ) => {
      const payload = {
        level,
        message: `${level} message`,
        metadata: { requestId: level }
      };

      expect( workflowLogMock ).toHaveBeenNthCalledWith( index + 1, payload );
    } );
  } );

  it( 'sanitizes messages and metadata before logging', async () => {
    const logger = await loadLogger();
    inWorkflowContextMock.mockReturnValue( true );

    logger.info( 123, {
      requestId: 'req-1',
      level: 'error',
      message: 'metadata message'
    } );

    expect( workflowLogMock ).toHaveBeenCalledWith( {
      level: 'info',
      message: '123',
      metadata: { requestId: 'req-1' }
    } );
  } );

  it( 'logs every level through the activity global logger when it is set outside workflow context', async () => {
    const logger = await loadLogger();
    const activityLoggerMock = vi.fn();
    globalThis[ACTIVITY_LOGGER_SYMBOL] = activityLoggerMock;

    logLevels.forEach( level => {
      logger[level]( `${level} message`, { requestId: level } );
    } );

    logLevels.forEach( ( level, index ) => {
      expect( activityLoggerMock ).toHaveBeenNthCalledWith( index + 1, {
        level,
        message: `${level} message`,
        metadata: { requestId: level }
      } );
    } );
    expect( workflowLogMock ).not.toHaveBeenCalled();
  } );

  it( 'logs every level to its native console method when no workflow or activity logger is available', async () => {
    const logger = await loadLogger();
    const consoleMocks = Object.fromEntries(
      [ 'debug', 'error', 'info', 'log', 'warn' ].map( method => [
        method,
        vi.spyOn( console, method ).mockImplementation( () => {} )
      ] )
    );

    logLevels.forEach( level => {
      logger[level]( `${level} message`, { requestId: level } );
    } );

    logLevels.forEach( level => {
      expect( consoleMocks[consoleMethodsByLevel[level]] ).toHaveBeenCalledWith(
        `${level} message`,
        { requestId: level }
      );
    } );
    expect( consoleMocks.error ).toHaveBeenCalledTimes( 1 );
    expect( consoleMocks.warn ).toHaveBeenCalledTimes( 1 );
    expect( consoleMocks.info ).toHaveBeenCalledTimes( 1 );
    expect( consoleMocks.debug ).toHaveBeenCalledTimes( 1 );
    expect( consoleMocks.log ).toHaveBeenCalledTimes( 3 );
    expect( workflowLogMock ).not.toHaveBeenCalled();
  } );
} );
