import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationError } from '#errors';
import { getProxyUrl, proxyEnvVars } from './proxy.js';

describe( 'helpers/proxy', () => {
  const originalEnv = { ...process.env };

  beforeEach( () => {
    for ( const key of proxyEnvVars ) {
      delete process.env[key];
    }
  } );

  afterEach( () => {
    process.env = { ...originalEnv };
  } );

  it( 'returns null when no proxy env vars are set', () => {
    expect( getProxyUrl() ).toBeNull();
  } );

  it( 'returns the first configured proxy URL in priority order', () => {
    process.env.HTTPS_PROXY = 'http://secure-proxy:8080';
    process.env.https_proxy = 'http://lower-secure-proxy:8080';
    process.env.HTTP_PROXY = 'http://plain-proxy:8080';
    process.env.http_proxy = 'http://lower-plain-proxy:8080';

    expect( getProxyUrl() ).toBe( 'http://secure-proxy:8080/' );
  } );

  it( 'skips empty proxy env vars', () => {
    process.env.HTTPS_PROXY = '';
    process.env.https_proxy = 'http://lower-secure-proxy:8080';

    expect( getProxyUrl() ).toBe( 'http://lower-secure-proxy:8080/' );
  } );

  it( 'throws a validation error when the first configured proxy URL is invalid', () => {
    process.env.HTTPS_PROXY = 'not a url';
    process.env.HTTP_PROXY = 'http://plain-proxy:8080';

    expect( () => getProxyUrl() ).toThrow( ValidationError );
    expect( () => getProxyUrl() ).toThrow( 'Invalid Proxy URL "not a url" at process.env.HTTPS_PROXY' );
  } );
} );
