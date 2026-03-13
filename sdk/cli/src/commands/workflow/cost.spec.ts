import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the services and utilities
vi.mock( '../../services/trace_reader.js', () => ( {
  getTrace: vi.fn()
} ) );

vi.mock( '../../services/cost_calculator.js', () => ( {
  calculateCost: vi.fn(),
  loadPricingConfig: vi.fn()
} ) );

vi.mock( '../../utils/cost_formatter.js', () => ( {
  formatCostReport: vi.fn()
} ) );

describe( 'workflow cost command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowCost = ( await import( './cost.js' ) ).default;
      expect( WorkflowCost ).toBeDefined();
      expect( WorkflowCost.description ).toBeDefined();
      expect( WorkflowCost.args ).toHaveProperty( 'workflowId' );
      expect( WorkflowCost.flags ).toHaveProperty( 'format' );
      expect( WorkflowCost.flags ).toHaveProperty( 'verbose' );
    } );

    it( 'should have workflowId as required arg', async () => {
      const WorkflowCost = ( await import( './cost.js' ) ).default;
      expect( WorkflowCost.args.workflowId.required ).toBe( true );
    } );

    it( 'should have tracePath as optional arg', async () => {
      const WorkflowCost = ( await import( './cost.js' ) ).default;
      expect( WorkflowCost.args ).toHaveProperty( 'tracePath' );
      expect( WorkflowCost.args.tracePath.required ).toBeFalsy();
    } );

    it( 'should have correct flag configuration', async () => {
      const WorkflowCost = ( await import( './cost.js' ) ).default;

      expect( WorkflowCost.flags.format.options ).toEqual( [ 'json', 'text' ] );
      expect( WorkflowCost.flags.format.default ).toBe( 'text' );
      expect( WorkflowCost.flags.verbose.default ).toBe( false );
    } );

    it( 'should have correct examples', async () => {
      const WorkflowCost = ( await import( './cost.js' ) ).default;
      expect( WorkflowCost.examples ).toBeDefined();
      expect( WorkflowCost.examples!.length ).toBeGreaterThan( 0 );
    } );
  } );
} );
