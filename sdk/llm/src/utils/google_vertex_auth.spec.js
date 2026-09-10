import { describe, it, expect, vi, afterEach } from 'vitest';
import { ValidationError } from '@outputai/core';
import { resolveGoogleVertexAuthOptions } from './google_vertex_auth.js';

const envVar = 'GCP_CREDENTIALS_JSON';

const serviceAccount = {
  type: 'service_account',
  project_id: 'output-test',
  private_key_id: 'a1b2c3',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQ\n-----END PRIVATE KEY-----\n',
  client_email: 'robot@output-test.iam.gserviceaccount.com'
};

const stubEnv = value => vi.stubEnv( envVar, value );
const toBase64 = value => Buffer.from( value, 'utf8' ).toString( 'base64' );
const invalidMessage = `Invalid ${envVar}: value is neither JSON nor base64 encoded JSON`;

afterEach( () => {
  vi.unstubAllEnvs();
} );

describe( 'resolveGoogleVertexAuthOptions', () => {
  it( 'returns no options when the env var is unset, leaving the provider on default credentials', () => {
    expect( resolveGoogleVertexAuthOptions() ).toEqual( {} );
  } );

  it( 'returns no options when the env var holds only whitespace', () => {
    stubEnv( '  \n  ' );

    expect( resolveGoogleVertexAuthOptions() ).toEqual( {} );
  } );

  it( 'reads raw JSON credentials', () => {
    stubEnv( JSON.stringify( serviceAccount ) );

    expect( resolveGoogleVertexAuthOptions() ).toEqual( { googleAuthOptions: { credentials: serviceAccount } } );
  } );

  it( 'reads base64 encoded JSON credentials', () => {
    stubEnv( toBase64( JSON.stringify( serviceAccount ) ) );

    expect( resolveGoogleVertexAuthOptions() ).toEqual( { googleAuthOptions: { credentials: serviceAccount } } );
  } );

  it( 'ignores whitespace around the value', () => {
    stubEnv( `\n  ${JSON.stringify( serviceAccount )}  \n` );

    expect( resolveGoogleVertexAuthOptions() ).toEqual( { googleAuthOptions: { credentials: serviceAccount } } );
  } );

  it( 'restores linebreaks in a double escaped private key', () => {
    const doubleEscaped = '-----BEGIN PRIVATE KEY-----\\nMIIEvQ\\n-----END PRIVATE KEY-----\\n';
    stubEnv( JSON.stringify( { ...serviceAccount, private_key: doubleEscaped } ) );

    const { googleAuthOptions } = resolveGoogleVertexAuthOptions();

    expect( googleAuthOptions.credentials.private_key ).toBe( serviceAccount.private_key );
  } );

  it( 'passes through credential types that carry no private key', () => {
    const externalAccount = {
      type: 'external_account',
      audience: '//iam.googleapis.com/projects/1/locations/global/workloadIdentityPools/pool/providers/provider',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt'
    };
    stubEnv( JSON.stringify( externalAccount ) );

    expect( resolveGoogleVertexAuthOptions() ).toEqual( { googleAuthOptions: { credentials: externalAccount } } );
  } );

  it.each( [
    [ 'malformed JSON', '{ "type": "service_account"' ],
    [ 'a value that is not base64', 'not base64 at all!!!' ],
    [ 'a credentials file path', '/app/test_workflows/gcp-credentials.json' ]
  ] )( 'throws a ValidationError for %s', ( _label, value ) => {
    stubEnv( value );

    expect( () => resolveGoogleVertexAuthOptions() ).toThrow( ValidationError );
    expect( () => resolveGoogleVertexAuthOptions() ).toThrow( invalidMessage );
  } );
} );
