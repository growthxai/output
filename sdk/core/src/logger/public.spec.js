import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadMock = vi.fn();
const infoMock = vi.fn();
const warnMock = vi.fn();
const errorMock = vi.fn();
const debugMock = vi.fn();

vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

vi.mock( './index.js', () => ( {
  createChildLogger: () => ( {
    info: infoMock,
    warn: warnMock,
    error: errorMock,
    debug: debugMock
  } )
} ) );

const activityInfo = {
  activityId: 'activity-1',
  activityType: 'myActivity',
  workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
  workflowType: 'myWorkflow'
};

const expectedContext = {
  activityId: 'activity-1',
  activityType: 'myActivity',
  workflowId: 'wf-1',
  workflowType: 'myWorkflow',
  runId: 'run-1'
};

describe( 'logger (public step logger)', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  it( 'injects workflow execution context when a step context is active', async () => {
    loadMock.mockReturnValue( { activityInfo } );
    const { logger } = await import( './public.js' );

    logger.info( 'hello', { foo: 1 } );

    expect( infoMock ).toHaveBeenCalledWith( 'hello', { ...expectedContext, foo: 1 } );
  } );

  it( 'logs with no context fields and does not throw when called outside a step', async () => {
    loadMock.mockReturnValue( undefined );
    const { logger } = await import( './public.js' );

    expect( () => logger.info( 'hi' ) ).not.toThrow();
    expect( infoMock ).toHaveBeenCalledWith( 'hi', {} );
  } );

  it( 'routes log() to the info level', async () => {
    loadMock.mockReturnValue( undefined );
    const { logger } = await import( './public.js' );

    logger.log( 'aliased' );

    expect( infoMock ).toHaveBeenCalledWith( 'aliased', {} );
  } );

  it( 'routes warn, error and debug to their levels', async () => {
    loadMock.mockReturnValue( undefined );
    const { logger } = await import( './public.js' );

    logger.warn( 'w' );
    logger.error( 'e' );
    logger.debug( 'd' );

    expect( warnMock ).toHaveBeenCalledWith( 'w', {} );
    expect( errorMock ).toHaveBeenCalledWith( 'e', {} );
    expect( debugMock ).toHaveBeenCalledWith( 'd', {} );
  } );

  it( 'lets user metadata override injected context fields', async () => {
    loadMock.mockReturnValue( { activityInfo } );
    const { logger } = await import( './public.js' );

    logger.info( 'override', { workflowId: 'custom' } );

    expect( infoMock ).toHaveBeenCalledWith( 'override', { ...expectedContext, workflowId: 'custom' } );
  } );
} );
