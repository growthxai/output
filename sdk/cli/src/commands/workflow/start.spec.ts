import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '../../api/generated/api.js', () => ( {
  postWorkflowStart: vi.fn()
} ) );

describe( 'workflow start command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart ).toBeDefined();
      expect( WorkflowStart.description ).toContain( 'Start a workflow' );
      expect( WorkflowStart.args ).toHaveProperty( 'workflowName' );
      expect( WorkflowStart.flags ).toHaveProperty( 'input' );
      expect( WorkflowStart.flags ).toHaveProperty( 'task-queue' );
    } );

    it( 'should have correct flag configuration', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.flags.input.required ).toBe( false );
    } );

    it( 'should have optional scenario argument', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.args ).toHaveProperty( 'scenario' );
      expect( WorkflowStart.args.scenario.required ).toBe( false );
    } );
  } );
} );
