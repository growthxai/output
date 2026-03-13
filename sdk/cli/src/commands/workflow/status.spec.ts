import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '../../api/generated/api.js', () => ( {
  getWorkflowIdStatus: vi.fn(),
  GetWorkflowIdStatus200Status: {
    canceled: 'canceled',
    completed: 'completed',
    continued_as_new: 'continued_as_new',
    failed: 'failed',
    running: 'running',
    terminated: 'terminated',
    timed_out: 'timed_out',
    unspecified: 'unspecified'
  }
} ) );

describe( 'workflow status command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowStatus = ( await import( './status.js' ) ).default;
      expect( WorkflowStatus ).toBeDefined();
      expect( WorkflowStatus.description ).toContain( 'Get workflow execution status' );
      expect( WorkflowStatus.args ).toHaveProperty( 'workflowId' );
      expect( WorkflowStatus.flags ).toHaveProperty( 'format' );
    } );

    it( 'should have correct flag configuration', async () => {
      const WorkflowStatus = ( await import( './status.js' ) ).default;
      expect( WorkflowStatus.flags.format.options ).toEqual( [ 'json', 'text' ] );
      expect( WorkflowStatus.flags.format.default ).toBe( 'text' );
    } );
  } );
} );
