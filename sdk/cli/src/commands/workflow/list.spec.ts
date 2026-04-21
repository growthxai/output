import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListScenarios = vi.fn().mockReturnValue( [] );

vi.mock( '#utils/scenario_resolver.js', () => ( {
  listScenariosForWorkflow: mockListScenarios
} ) );

describe( 'workflow list command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'command functionality', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowList = ( await import( './list.js' ) ).default;
      expect( WorkflowList ).toBeDefined();
      expect( WorkflowList.description ).toContain( 'List available workflows' );
      expect( WorkflowList.flags ).toHaveProperty( 'format' );
      expect( WorkflowList.flags ).toHaveProperty( 'detailed' );
      expect( WorkflowList.flags ).toHaveProperty( 'filter' );
    } );

    it( 'should have correct flag configuration', async () => {
      const WorkflowList = ( await import( './list.js' ) ).default;
      expect( WorkflowList.flags.format.options ).toEqual( [ 'list', 'table', 'json' ] );
      expect( WorkflowList.flags.format.default ).toBe( 'list' );
      expect( WorkflowList.flags.detailed.default ).toBe( false );
    } );
  } );
} );

describe( 'workflow list parsing', () => {
  it( 'should parse workflow definitions correctly', async () => {
    const { parseWorkflowForDisplay } = await import( './list.js' );

    const mockWorkflow = {
      name: 'test-workflow',
      description: 'A test workflow',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message' },
          count: { type: 'number', description: 'The count' }
        },
        required: [ 'message' ]
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'string' }
        }
      }
    };

    const parsed = parseWorkflowForDisplay( mockWorkflow );
    expect( parsed.name ).toBe( 'test-workflow' );
    expect( parsed.description ).toBe( 'A test workflow' );
    expect( parsed.inputs ).toContain( 'message: string' );
    expect( parsed.inputs ).toContain( 'count: number?' );
    expect( parsed.outputs ).toContain( 'result: string?' );
    expect( parsed.scenarios ).toBe( 'none' );
  } );

  it( 'should handle workflows without schemas', async () => {
    const { parseWorkflowForDisplay } = await import( './list.js' );

    const mockWorkflow = {
      name: 'simple-workflow',
      description: 'No parameters'
    };

    const parsed = parseWorkflowForDisplay( mockWorkflow );
    expect( parsed.name ).toBe( 'simple-workflow' );
    expect( parsed.inputs ).toBe( 'none' );
    expect( parsed.outputs ).toBe( 'none' );
    expect( parsed.scenarios ).toBe( 'none' );
    expect( parsed.aliases ).toBe( 'none' );
  } );

  it( 'should include aliases when present', async () => {
    const { parseWorkflowForDisplay } = await import( './list.js' );

    const mockWorkflow = {
      name: 'aliased-workflow',
      description: 'Has aliases',
      aliases: [ 'old_name', 'legacy_name' ]
    };

    const parsed = parseWorkflowForDisplay( mockWorkflow );
    expect( parsed.aliases ).toBe( 'old_name, legacy_name' );
  } );

  it( 'should show none when aliases array is empty', async () => {
    const { parseWorkflowForDisplay } = await import( './list.js' );

    const mockWorkflow = {
      name: 'no-aliases',
      description: 'Empty aliases',
      aliases: []
    };

    const parsed = parseWorkflowForDisplay( mockWorkflow );
    expect( parsed.aliases ).toBe( 'none' );
  } );

  it( 'should include scenario names when scenarios exist', async () => {
    mockListScenarios.mockReturnValueOnce( [ 'basic', 'advanced', 'stress_test' ] );
    const { parseWorkflowForDisplay } = await import( './list.js' );

    const mockWorkflow = {
      name: 'workflow-with-scenarios',
      description: 'Has scenarios'
    };

    const parsed = parseWorkflowForDisplay( mockWorkflow );
    expect( parsed.scenarios ).toBe( 'basic, advanced, stress_test' );
  } );

  it( 'should format nested parameters correctly', async () => {
    const { parseWorkflowForDisplay } = await import( './list.js' );

    const mockWorkflow = {
      name: 'nested-workflow',
      inputSchema: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' }
            }
          }
        }
      }
    };

    const parsed = parseWorkflowForDisplay( mockWorkflow );
    expect( parsed.inputs ).toContain( 'user.name: string' );
    expect( parsed.inputs ).toContain( 'user.email: string' );
  } );
} );
