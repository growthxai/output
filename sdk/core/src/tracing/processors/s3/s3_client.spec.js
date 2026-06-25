import { describe, it, expect, vi, beforeEach } from 'vitest';

const getVarsMock = vi.fn();
vi.mock( './configs', () => ( { getVars: () => getVarsMock() } ) );

const ctorState = { args: null };
class S3ClientMock {
  constructor( args ) {
    ctorState.args = args;
  }
}
vi.mock( '@aws-sdk/client-s3', () => ( {
  S3Client: S3ClientMock
} ) );

const uploadDoneMock = vi.fn();
const uploadCtorState = { args: [] };
class UploadMock {
  constructor( args ) {
    uploadCtorState.args.push( args );
  }

  done = uploadDoneMock;
}
vi.mock( '@aws-sdk/lib-storage', () => ( { Upload: UploadMock } ) );

async function loadModule() {
  vi.resetModules();
  return import( './s3_client.js' );
}

describe( 'tracing/processors/s3/s3_client', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    ctorState.args = null;
    uploadCtorState.args = [];
    uploadDoneMock.mockResolvedValue( undefined );
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

    expect( ctorState.args ).toEqual( {
      region: 'us-east-1',
      credentials: { secretAccessKey: 'sek', accessKeyId: 'id' }
    } );
    expect( uploadCtorState.args ).toHaveLength( 1 );
    expect( uploadCtorState.args[0] ).toEqual( {
      client: expect.any( S3ClientMock ),
      params: { Bucket: 'bucket', Key: 'wf/key.json', Body: '{"a":1}' }
    } );
    expect( uploadDoneMock ).toHaveBeenCalledTimes( 1 );

    // subsequent upload uses cached client
    await upload( { key: 'wf/key2.json', content: '{}' } );
    expect( uploadCtorState.args ).toHaveLength( 2 );
    expect( uploadDoneMock ).toHaveBeenCalledTimes( 2 );
  } );
} );

