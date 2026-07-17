import { beforeEach, describe, expect, it, vi } from 'vitest';

const undiciMock = vi.hoisted( () => ( {
  dispatcher: { dispatch: vi.fn() },
  envHttpProxyAgent: vi.fn(),
  fetch: vi.fn()
} ) );

vi.mock( 'undici', async importOriginal => {
  const actual = await importOriginal<typeof import( 'undici' )>();
  class EnvHttpProxyAgent {
    constructor( options: unknown ) {
      undiciMock.envHttpProxyAgent( options );
      return undiciMock.dispatcher as EnvHttpProxyAgent;
    }
  }

  return {
    ...actual,
    EnvHttpProxyAgent,
    fetch: undiciMock.fetch
  };
} );

vi.mock( './logger.js', () => ( {
  logRequest: vi.fn(),
  logResponse: vi.fn(),
  logError: vi.fn(),
  logFailure: vi.fn()
} ) );
vi.mock( './events.js', () => ( {
  emitSuccess: vi.fn(),
  emitError: vi.fn(),
  emitFailure: vi.fn()
} ) );
vi.mock( './utils.js', () => ( {
  addRequestIdToResponse: vi.fn()
} ) );

import { Request, Response } from 'undici';
import { instrumentedFetch } from './index.js';

describe( 'instrumentedFetch default dispatcher', () => {
  beforeEach( () => {
    undiciMock.fetch.mockReset();
    undiciMock.fetch.mockResolvedValue( new Response( 'ok' ) );
  } );

  it( 'uses an EnvHttpProxyAgent when dispatcher is omitted', async () => {
    await instrumentedFetch( 'https://example.com' );

    expect( undiciMock.envHttpProxyAgent ).toHaveBeenCalledWith( { allowH2: false } );
    expect( undiciMock.fetch ).toHaveBeenCalledWith(
      expect.any( Request ),
      { dispatcher: undiciMock.dispatcher }
    );
  } );
} );
