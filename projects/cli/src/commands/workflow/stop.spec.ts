import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '../../api/generated/api.js', () => ( {
  patchWorkflowIdStop: vi.fn()
} ) );

describe( 'workflow stop command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowStop = ( await import( './stop.js' ) ).default;
      expect( WorkflowStop ).toBeDefined();
      expect( WorkflowStop.description ).toContain( 'Stop a workflow execution' );
      expect( WorkflowStop.args ).toHaveProperty( 'workflowId' );
    } );
  } );
} );
