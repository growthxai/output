import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TraceFileDownloadError, TraceFileParseError, InvalidTraceFileUrl } from './errors.js';
import { fetchTraceFromS3 } from './s3_client.js';

const mockSend = vi.fn();

vi.mock( '@aws-sdk/client-s3', () => ( {
  S3Client: vi.fn().mockImplementation( function () {
    return { send: mockSend };
  } ),
  GetObjectCommand: vi.fn()
} ) );

vi.mock( '#configs', () => ( {
  aws: { region: 'us-west-1', accessKeyId: undefined, secretAccessKey: undefined }
} ) );

import { aws as awsConfig } from '#configs';

describe( 's3_client', () => {
  beforeEach( () => {
    mockSend.mockReset();
    awsConfig.accessKeyId = 'test-key';
    awsConfig.secretAccessKey = 'test-secret';
  } );

  afterEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'TraceFileDownloadError', () => {
    it( 'creates error with message, url, and cause', () => {
      const cause = new Error( 'underlying' );
      const error = new TraceFileDownloadError( 'test message', 'https://example.com/file.json', cause );

      expect( error.message ).toBe( 'test message' );
      expect( error.url ).toBe( 'https://example.com/file.json' );
      expect( error.cause ).toBe( cause );
      expect( error ).toBeInstanceOf( Error );
      expect( error ).toBeInstanceOf( TraceFileDownloadError );
    } );
  } );

  describe( 'TraceFileParseError', () => {
    it( 'creates error with message, url, and cause', () => {
      const cause = new SyntaxError( 'Unexpected token' );
      const error = new TraceFileParseError( 'Invalid trace file', 'https://bucket.s3.amazonaws.com/key.json', cause );

      expect( error.message ).toBe( 'Invalid trace file' );
      expect( error.url ).toBe( 'https://bucket.s3.amazonaws.com/key.json' );
      expect( error.cause ).toBe( cause );
      expect( error ).toBeInstanceOf( Error );
      expect( error ).toBeInstanceOf( TraceFileParseError );
    } );
  } );

  describe( 'InvalidTraceFileUrl', () => {
    it( 'creates error with message, url, and optional cause', () => {
      const error = new InvalidTraceFileUrl( 'Url is not a valid S3 url', 'https://bad.com' );

      expect( error.message ).toBe( 'Url is not a valid S3 url' );
      expect( error.url ).toBe( 'https://bad.com' );
      expect( error.cause ).toBeUndefined();
      expect( error ).toBeInstanceOf( Error );
      expect( error ).toBeInstanceOf( InvalidTraceFileUrl );
    } );
  } );

  describe( 'fetchTraceFromS3', () => {
    const validS3Url = 'https://my-bucket.s3.us-west-2.amazonaws.com/path/trace.json';

    it( 'throws InvalidTraceFileUrl for invalid S3 URL', async () => {
      await expect( fetchTraceFromS3( 'not-a-valid-url' ) )
        .rejects
        .toThrow( InvalidTraceFileUrl );
    } );

    it( 'throws InvalidTraceFileUrl for empty string URL', async () => {
      await expect( fetchTraceFromS3( '' ) )
        .rejects
        .toThrow( InvalidTraceFileUrl );
    } );

    it( 'throws TraceFileDownloadError when AWS keys are missing', async () => {
      awsConfig.accessKeyId = undefined;
      awsConfig.secretAccessKey = undefined;
      await expect( fetchTraceFromS3( validS3Url ) )
        .rejects
        .toThrow( TraceFileDownloadError );
      try {
        await fetchTraceFromS3( validS3Url );
      } catch ( err ) {
        expect( err.message ).toBe( 'Missing AWS keys to authenticate' );
      }
    } );

    it( 'returns parsed JSON when S3 GetObject succeeds', async () => {
      const mockTraceData = { workflow: 'test', steps: [] };
      mockSend.mockResolvedValue( {
        Body: {
          transformToString: () => Promise.resolve( JSON.stringify( mockTraceData ) )
        }
      } );

      const result = await fetchTraceFromS3( validS3Url );

      expect( result ).toEqual( mockTraceData );
    } );

    it( 'throws TraceFileDownloadError when S3 client send fails', async () => {
      const s3Error = new Error( 'Network error' );
      mockSend.mockRejectedValue( s3Error );

      await expect( fetchTraceFromS3( validS3Url ) )
        .rejects
        .toThrow( TraceFileDownloadError );

      try {
        await fetchTraceFromS3( validS3Url );
      } catch ( err ) {
        expect( err.message ).toBe( 'S3 GetObject failure' );
        expect( err.url ).toBe( validS3Url );
        expect( err.cause ).toBe( s3Error );
      }
    } );

    it( 'throws TraceFileParseError when body is not valid JSON', async () => {
      mockSend.mockResolvedValue( {
        Body: {
          transformToString: () => Promise.resolve( 'not valid json' )
        }
      } );

      await expect( fetchTraceFromS3( validS3Url ) )
        .rejects
        .toThrow( TraceFileParseError );

      try {
        await fetchTraceFromS3( validS3Url );
      } catch ( err ) {
        expect( err.message ).toBe( 'Invalid trace file' );
        expect( err.url ).toBe( validS3Url );
        expect( err.cause ).toBeDefined();
      }
    } );

    it( 'passes URL through to TraceFileParseError on parse failure', async () => {
      mockSend.mockResolvedValue( {
        Body: {
          transformToString: () => Promise.resolve( '}{' )
        }
      } );

      await expect( fetchTraceFromS3( validS3Url ) ).rejects.toThrow( TraceFileParseError );
      try {
        await fetchTraceFromS3( validS3Url );
      } catch ( err ) {
        expect( err.url ).toBe( validS3Url );
      }
    } );
  } );
} );
