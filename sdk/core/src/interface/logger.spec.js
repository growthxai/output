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

const validateLogArgumentsMock = vi.fn();

vi.mock( './validations/index.js', () => ( {
  validateLogArguments: validateLogArgumentsMock
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

      expect( validateLogArgumentsMock ).toHaveBeenNthCalledWith( index + 1, {
        message: payload.message,
        metadata: payload.metadata
      } );
      expect( workflowLogMock ).toHaveBeenNthCalledWith( index + 1, payload );
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

  it( 'logs every level to console when no workflow or activity logger is available', async () => {
    const logger = await loadLogger();
    const consoleLogMock = vi.spyOn( console, 'log' ).mockImplementation( () => {} );

    logLevels.forEach( level => {
      logger[level]( `${level} message`, { requestId: level } );
    } );

    logLevels.forEach( ( level, index ) => {
      expect( consoleLogMock ).toHaveBeenNthCalledWith(
        index + 1,
        `logger.${level}`,
        `${level} message`,
        { requestId: level }
      );
    } );
    expect( workflowLogMock ).not.toHaveBeenCalled();
  } );
} );
