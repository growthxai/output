import { describe, it, expect, vi, beforeEach } from 'vitest';

const infoMock = vi.fn();
const warnMock = vi.fn();
const errorMock = vi.fn();
const debugMock = vi.fn();

vi.mock( './index.js', () => ( {
  createChildLogger: () => ( {
    info: infoMock,
    warn: warnMock,
    error: errorMock,
    debug: debugMock
  } )
} ) );

describe( 'logger (public step logger)', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  it( 'routes each level to the underlying child logger with message and meta', async () => {
    const { logger } = await import( './public.js' );

    logger.info( 'i', { a: 1 } );
    logger.warn( 'w' );
    logger.error( 'e' );
    logger.debug( 'd' );

    expect( infoMock ).toHaveBeenCalledWith( 'i', { a: 1 } );
    expect( warnMock ).toHaveBeenCalledWith( 'w', undefined );
    expect( errorMock ).toHaveBeenCalledWith( 'e', undefined );
    expect( debugMock ).toHaveBeenCalledWith( 'd', undefined );
  } );

  it( 'routes log() to the info level', async () => {
    const { logger } = await import( './public.js' );

    logger.log( 'aliased', { b: 2 } );

    expect( infoMock ).toHaveBeenCalledWith( 'aliased', { b: 2 } );
  } );
} );
