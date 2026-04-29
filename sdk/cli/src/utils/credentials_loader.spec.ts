import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as credentials from '@outputai/credentials';
import { loadCredentialRefs } from './credentials_loader.js';

vi.mock( '@outputai/credentials', async () => {
  const actual = await vi.importActual<typeof import( '@outputai/credentials' )>( '@outputai/credentials' );
  return {
    ...actual,
    resolveCredentialRefs: vi.fn()
  };
} );

describe( 'loadCredentialRefs', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'should call resolveCredentialRefs without errors when no credentials are misconfigured', () => {
    vi.mocked( credentials.resolveCredentialRefs ).mockReturnValue( [] );

    expect( () => loadCredentialRefs() ).not.toThrow();
    expect( credentials.resolveCredentialRefs ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'should print a clean error message and exit on MissingKeyError without dumping a stack trace', () => {
    vi.mocked( credentials.resolveCredentialRefs ).mockImplementation( () => {
      throw new credentials.MissingKeyError();
    } );

    const consoleErrorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => {} );
    const exitSpy = vi.spyOn( process, 'exit' ).mockImplementation( ( () => undefined ) as never );

    loadCredentialRefs();

    expect( consoleErrorSpy ).toHaveBeenCalledTimes( 1 );
    const printedMessage = consoleErrorSpy.mock.calls[0]?.[0] as string;
    expect( printedMessage ).toContain( 'No credentials key found' );
    expect( printedMessage ).toContain( 'OUTPUT_CREDENTIALS_KEY' );
    expect( printedMessage ).toContain( 'config/credentials.key' );
    expect( printedMessage ).not.toContain( '    at ' );

    expect( exitSpy ).toHaveBeenCalledWith( 1 );
  } );

  it( 'should include the environment-specific hints in the printed message when an environment is set', () => {
    vi.mocked( credentials.resolveCredentialRefs ).mockImplementation( () => {
      throw new credentials.MissingKeyError( 'production' );
    } );

    const consoleErrorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => {} );
    const exitSpy = vi.spyOn( process, 'exit' ).mockImplementation( ( () => undefined ) as never );

    loadCredentialRefs();

    const printedMessage = consoleErrorSpy.mock.calls[0]?.[0] as string;
    expect( printedMessage ).toContain( 'OUTPUT_CREDENTIALS_KEY_PRODUCTION' );
    expect( printedMessage ).toContain( 'config/credentials/production.key' );
    expect( exitSpy ).toHaveBeenCalledWith( 1 );
  } );

  it( 'should rethrow unexpected errors so they are not silently swallowed', () => {
    vi.mocked( credentials.resolveCredentialRefs ).mockImplementation( () => {
      throw new Error( 'something else broke' );
    } );

    expect( () => loadCredentialRefs() ).toThrow( 'something else broke' );
  } );
} );
