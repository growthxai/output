import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

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
} );
