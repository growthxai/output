import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFormatStatus } = vi.hoisted( () => ( {
  mockFormatStatus: vi.fn()
} ) );

vi.mock( '../types.js', () => ( {
  formatStatus: mockFormatStatus
} ) );

describe( 'getStatus', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockFormatStatus.mockReturnValue( 'formatted-status' );
  } );

  it( 'describes a pinned run and maps Temporal timestamps to epoch milliseconds', async () => {
    const describe = vi.fn().mockResolvedValue( {
      runId: 'run-id',
      status: { name: 'COMPLETED' },
      startTime: new Date( '2024-01-01T00:00:00.000Z' ),
      closeTime: new Date( '2024-01-01T00:00:01.000Z' )
    } );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const client = { workflow: { getHandle } };
    const { getStatus } = await import( './get_status.js' );

    const result = await getStatus( { client }, 'workflow-id', 'run-id' );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', 'run-id' );
    expect( mockFormatStatus ).toHaveBeenCalledWith( 'COMPLETED' );
    expect( result ).toEqual( {
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'formatted-status',
      startedAt: 1_704_067_200_000,
      completedAt: 1_704_067_201_000
    } );
  } );

  it( 'passes undefined runId for latest-run status and returns empty timestamp fields when absent', async () => {
    const describe = vi.fn().mockResolvedValue( {
      runId: 'latest-run',
      status: { name: 'RUNNING' },
      startTime: null,
      closeTime: null
    } );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const client = { workflow: { getHandle } };
    const { getStatus } = await import( './get_status.js' );

    const result = await getStatus( { client }, 'workflow-id' );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', undefined );
    expect( mockFormatStatus ).toHaveBeenCalledWith( 'RUNNING' );
    expect( result ).toEqual( {
      workflowId: 'workflow-id',
      runId: 'latest-run',
      status: 'formatted-status',
      startedAt: '',
      completedAt: ''
    } );
  } );
} );
