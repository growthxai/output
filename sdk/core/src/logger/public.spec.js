import { describe, it, expect, vi, beforeEach } from 'vitest';

const infoMock = vi.fn();
const warnMock = vi.fn();
const errorMock = vi.fn();
const debugMock = vi.fn();
const createChildLoggerMock = vi.fn( () => ( {
  info: infoMock,
  warn: warnMock,
  error: errorMock,
  debug: debugMock
} ) );

vi.mock( './index.js', () => ( {
  createChildLogger: createChildLoggerMock
} ) );

describe( 'createLogger', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  it( 'creates a child logger under the given namespace', async () => {
    const { createLogger } = await import( './public.js' );

    createLogger( 'LLM Cost' );

    expect( createChildLoggerMock ).toHaveBeenCalledWith( 'LLM Cost' );
  } );

  it( 'routes each level to the child logger, with log() aliased to info', async () => {
    const { createLogger } = await import( './public.js' );
    const log = createLogger( 'X' );

    log.info( 'i', { a: 1 } );
    log.warn( 'w' );
    log.error( 'e' );
    log.debug( 'd' );
    log.log( 'aliased', { b: 2 } );

    expect( infoMock ).toHaveBeenCalledWith( 'i', { a: 1 } );
    expect( warnMock ).toHaveBeenCalledWith( 'w', undefined );
    expect( errorMock ).toHaveBeenCalledWith( 'e', undefined );
    expect( debugMock ).toHaveBeenCalledWith( 'd', undefined );
    expect( infoMock ).toHaveBeenCalledWith( 'aliased', { b: 2 } );
  } );
} );

describe( 'logger (default step logger)', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  it( 'is created under the "Step" namespace and routes to info', async () => {
    const { logger } = await import( './public.js' );

    logger.info( 'hi' );

    expect( createChildLoggerMock ).toHaveBeenCalledWith( 'Step' );
    expect( infoMock ).toHaveBeenCalledWith( 'hi', undefined );
  } );
} );
