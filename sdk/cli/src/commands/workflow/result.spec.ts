import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '../../api/generated/api.js', () => ( {
  getWorkflowIdResult: vi.fn()
} ) );

describe( 'workflow result command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowResult = ( await import( './result.js' ) ).default;
      expect( WorkflowResult ).toBeDefined();
      expect( WorkflowResult.description ).toContain( 'Get workflow execution result' );
      expect( WorkflowResult.args ).toHaveProperty( 'workflowId' );
      expect( WorkflowResult.flags ).toHaveProperty( 'format' );
    } );

    it( 'should have correct flag configuration', async () => {
      const WorkflowResult = ( await import( './result.js' ) ).default;
      expect( WorkflowResult.flags.format.options ).toEqual( [ 'json', 'text' ] );
      expect( WorkflowResult.flags.format.default ).toBe( 'text' );
    } );
  } );
} );
