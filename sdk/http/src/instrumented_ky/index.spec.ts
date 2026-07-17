import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Options } from 'ky';
import { instrumentedFetch } from '#instrumented_fetch/index.js';

const kyMock = vi.hoisted( () => ( {
  client: { get: vi.fn() },
  create: vi.fn()
} ) );

vi.mock( 'ky', () => ( {
  default: { create: kyMock.create }
} ) );

import { createKyClient } from './index.js';

describe( 'createKyClient', () => {
  beforeEach( () => {
    kyMock.create.mockReset();
    kyMock.create.mockReturnValue( kyMock.client );
  } );

  it( 'creates a Ky client using instrumentedFetch', () => {
    expect( createKyClient() ).toBe( kyMock.client );
    expect( kyMock.create ).toHaveBeenCalledWith( { fetch: instrumentedFetch } );
  } );

  it( 'forwards Ky options', () => {
    const options: Options = {
      prefix: 'https://example.com',
      timeout: 30_000,
      retry: { limit: 3 }
    };

    createKyClient( options );

    expect( kyMock.create ).toHaveBeenCalledWith( { fetch: instrumentedFetch, ...options } );
  } );

  it( 'allows callers to override fetch', () => {
    const fetch = vi.fn( async () => new Response() ) as NonNullable<Options['fetch']>;

    createKyClient( { fetch } );

    expect( kyMock.create ).toHaveBeenCalledWith( { fetch } );
  } );
} );
