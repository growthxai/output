import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the TraceReader service
vi.mock( '../../services/trace_reader.js', () => ( {
  getTrace: vi.fn()
} ) );

// Mock the utilities
vi.mock( '../../utils/trace_formatter.js', () => ( {
  displayDebugTree: vi.fn()
} ) );

describe( 'workflow debug command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowDebug = ( await import( './debug.js' ) ).default;
      expect( WorkflowDebug ).toBeDefined();
      expect( WorkflowDebug.description ).toContain( 'Get and display workflow execution trace for debugging' );
      expect( WorkflowDebug.args ).toHaveProperty( 'workflowId' );
    } );

    it( 'enables the built-in --json flag', async () => {
      const WorkflowDebug = ( await import( './debug.js' ) ).default;
      expect( WorkflowDebug.enableJsonFlag ).toBe( true );
    } );

    it( 'should have correct examples', async () => {
      const WorkflowDebug = ( await import( './debug.js' ) ).default;
      expect( WorkflowDebug.examples ).toBeDefined();
      expect( WorkflowDebug.examples.length ).toBeGreaterThan( 0 );
    } );
  } );
} );
