import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#utils', () => ( {
  throws: e => {
    throw e;
  }
} ) );

const getVarsMock = vi.fn();
vi.mock( './configs', () => ( { getVars: () => getVarsMock() } ) );

const sendMock = vi.fn();
const ctorState = { args: null };
class S3ClientMock {
  constructor( args ) {
    ctorState.args = args;
  } send = sendMock;
}
class PutObjectCommandMock {
  constructor( input ) {
    this.input = input;
  }
}

vi.mock( '@aws-sdk/client-s3', () => ( {
  S3Client: S3ClientMock,
  PutObjectCommand: PutObjectCommandMock
} ) );

async function loadModule() {
  vi.resetModules();
  return import( './s3_client.js' );
}

describe( 'tracing/processors/s3/s3_client', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    getVarsMock.mockReturnValue( {
      awsRegion: 'us-east-1',
      awsAccessKeyId: 'id',
      awsSecretAccessKey: 'sek',
      remoteS3Bucket: 'bucket'
    } );
  } );

  it( 'creates client once with config and uploads with bucket/key/content', async () => {
    const { upload } = await loadModule();

    await upload( { key: 'wf/key.json', content: '{"a":1}' } );

    expect( ctorState.args ).toEqual( { region: 'us-east-1', credentials: { secretAccessKey: 'sek', accessKeyId: 'id' } } );
    expect( sendMock ).toHaveBeenCalledTimes( 1 );
    const cmd = sendMock.mock.calls[0][0];
    expect( cmd ).toBeInstanceOf( PutObjectCommandMock );
    expect( cmd.input ).toEqual( { Bucket: 'bucket', Key: 'wf/key.json', Body: '{"a":1}' } );

    // subsequent upload uses cached client
    await upload( { key: 'wf/key2.json', content: '{}' } );
    expect( sendMock ).toHaveBeenCalledTimes( 2 );
  } );
} );

