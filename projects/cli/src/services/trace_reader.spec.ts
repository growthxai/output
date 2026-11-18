import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { HttpError } from '#api/http_client.js';

const mockGetWorkflowIdTraceLog = vi.fn();
vi.mock( '#api/generated/api.js', () => ( {
  getWorkflowIdTraceLog: ( ...args: unknown[] ) => mockGetWorkflowIdTraceLog( ...args )
} ) );

const mockReadFile = vi.fn();
vi.mock( 'node:fs/promises', () => ( {
  readFile: ( ...args: unknown[] ) => mockReadFile( ...args )
} ) );

describe( 'trace_reader', () => {
  beforeEach( () => {
    mockGetWorkflowIdTraceLog.mockReset();
    mockReadFile.mockReset();
  } );

  afterEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'getTrace', () => {
    it( 'should return trace data directly for remote source', async () => {
      const mockTraceData = {
        root: { workflowName: 'test', workflowId: 'wf-123', startTime: Date.now() },
        children: []
      };

      mockGetWorkflowIdTraceLog.mockResolvedValue( {
        status: 200,
        data: {
          source: 'remote',
          data: mockTraceData
        }
      } );

      const { getTrace } = await import( './trace_reader.js' );
      const result = await getTrace( 'wf-123' );

      expect( result.data ).toEqual( mockTraceData );
      expect( result.location.isRemote ).toBe( true );
      expect( mockReadFile ).not.toHaveBeenCalled();
    } );

    it( 'should read local file for local source', async () => {
      const mockTraceData = {
        root: { workflowName: 'test', workflowId: 'wf-123', startTime: Date.now() },
        children: []
      };

      mockGetWorkflowIdTraceLog.mockResolvedValue( {
        status: 200,
        data: {
          source: 'local',
          localPath: '/path/to/trace.json'
        }
      } );

      mockReadFile.mockResolvedValue( JSON.stringify( mockTraceData ) );

      const { getTrace } = await import( './trace_reader.js' );
      const result = await getTrace( 'wf-123' );

      expect( result.data ).toEqual( mockTraceData );
      expect( result.location.isRemote ).toBe( false );
      expect( result.location.path ).toBe( '/path/to/trace.json' );
      expect( mockReadFile ).toHaveBeenCalledWith( '/path/to/trace.json', 'utf-8' );
    } );

    it( 'should throw error when API returns 404', async () => {
      mockGetWorkflowIdTraceLog.mockResolvedValue( {
        status: 404,
        data: { error: 'Not found' }
      } );

      const { getTrace } = await import( './trace_reader.js' );

      await expect( getTrace( 'wf-123' ) )
        .rejects
        .toThrow( 'Workflow not found or no trace available: wf-123' );
    } );

    it( 'should throw error when API returns 500', async () => {
      mockGetWorkflowIdTraceLog.mockResolvedValue( {
        status: 500,
        data: { error: 'S3 access denied' }
      } );

      const { getTrace } = await import( './trace_reader.js' );

      await expect( getTrace( 'wf-123' ) )
        .rejects
        .toThrow( 'S3 access denied' );
    } );
  } );

  describe( 'buildTraceTooLargeMessage', () => {
    it( 'should build the friendly message with both sizes for a 413', async () => {
      const error = new HttpError( 'Payload Too Large', { status: 413, data: { size: 587158372, maxSize: 268435456 } } );

      const { buildTraceTooLargeMessage } = await import( './trace_reader.js' );

      expect( buildTraceTooLargeMessage( error ) )
        .toBe( 'Trace file is too big for this feature. Max size 256 MB, file size 560 MB' );
    } );

    it( 'should omit the sizes when the 413 body does not carry them', async () => {
      const { buildTraceTooLargeMessage } = await import( './trace_reader.js' );

      expect( buildTraceTooLargeMessage( new HttpError( 'Payload Too Large', { status: 413 } ) ) )
        .toBe( 'Trace file is too big for this feature.' );
      expect( buildTraceTooLargeMessage( new HttpError( 'Payload Too Large', { status: 413, data: { size: 'x' } } ) ) )
        .toBe( 'Trace file is too big for this feature.' );
    } );

    it( 'should return null for other statuses and other errors', async () => {
      const { buildTraceTooLargeMessage } = await import( './trace_reader.js' );

      expect( buildTraceTooLargeMessage( new HttpError( 'Server error', { status: 500 } ) ) ).toBeNull();
      expect( buildTraceTooLargeMessage( new Error( 'boom' ) ) ).toBeNull();
      expect( buildTraceTooLargeMessage( undefined ) ).toBeNull();
    } );
  } );

  describe( 'getTrace with a 413', () => {
    it( 'should throw the friendly message instead of the HTTP error', async () => {
      mockGetWorkflowIdTraceLog.mockRejectedValue(
        new HttpError( 'Payload Too Large', { status: 413, data: { size: 587158372, maxSize: 268435456 } } )
      );

      const { getTrace } = await import( './trace_reader.js' );

      await expect( getTrace( 'wf-123' ) )
        .rejects
        .toThrow( 'Trace file is too big for this feature. Max size 256 MB, file size 560 MB' );
    } );

    it( 'should rethrow other request errors unchanged', async () => {
      const error = new HttpError( 'Server error', { status: 500 } );
      mockGetWorkflowIdTraceLog.mockRejectedValue( error );

      const { getTrace } = await import( './trace_reader.js' );

      await expect( getTrace( 'wf-123' ) ).rejects.toBe( error );
    } );
  } );
} );
