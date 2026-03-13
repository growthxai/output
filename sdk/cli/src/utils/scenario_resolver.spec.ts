import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveScenarioPath, getScenarioNotFoundMessage, extractWorkflowRelativePath, listScenariosForWorkflow } from './scenario_resolver.js';
import * as fs from 'node:fs';
import * as api from '#api/generated/api.js';

vi.mock( 'node:fs', () => ( {
  existsSync: vi.fn(),
  readdirSync: vi.fn()
} ) );

vi.mock( '#api/generated/api.js', () => ( {
  getWorkflowCatalog: vi.fn()
} ) );

function mockCatalog( workflows: Array<{ name: string; path?: string }> ) {
  vi.mocked( api.getWorkflowCatalog ).mockResolvedValue( {
    data: { workflows },
    status: 200,
    headers: new Headers()
  } as never );
}

function mockCatalogFailure() {
  vi.mocked( api.getWorkflowCatalog ).mockRejectedValue( new Error( 'API unavailable' ) );
}

describe( 'extractWorkflowRelativePath', () => {
  it( 'should extract relative path from workflow.js path', () => {
    expect( extractWorkflowRelativePath( '/app/dist/workflows/basic_research/workflow.js' ) )
      .toBe( 'basic_research' );
  } );

  it( 'should extract nested relative path', () => {
    expect( extractWorkflowRelativePath( '/app/dist/workflows/viz_examples/01_simple_linear/workflow.js' ) )
      .toBe( 'viz_examples/01_simple_linear' );
  } );

  it( 'should handle workflow.ts extension', () => {
    expect( extractWorkflowRelativePath( '/src/workflows/my_flow/workflow.ts' ) )
      .toBe( 'my_flow' );
  } );

  it( 'should return null for non-matching paths', () => {
    expect( extractWorkflowRelativePath( '/app/dist/other/workflow.js' ) ).toBeNull();
    expect( extractWorkflowRelativePath( '/app/dist/workflows/' ) ).toBeNull();
  } );
} );

describe( 'resolveScenarioPath', () => {
  beforeEach( () => {
    vi.resetAllMocks();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  describe( 'when API returns workflow with path', () => {
    it( 'should resolve scenario using catalog path', async () => {
      mockCatalog( [ { name: 'my_workflow', path: '/app/dist/workflows/my_workflow/workflow.js' } ] );
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        return String( path ).includes( 'src/workflows/my_workflow/scenarios/test_scenario.json' );
      } );

      const result = await resolveScenarioPath( 'my_workflow', 'test_scenario', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'src/workflows/my_workflow/scenarios/test_scenario.json' );
    } );

    it( 'should resolve when workflow name differs from folder name', async () => {
      mockCatalog( [ { name: 'simpleLinear', path: '/app/dist/workflows/viz_examples/01_simple_linear/workflow.js' } ] );
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        return String( path ).includes( 'src/workflows/viz_examples/01_simple_linear/scenarios/basic.json' );
      } );

      const result = await resolveScenarioPath( 'simpleLinear', 'basic', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'src/workflows/viz_examples/01_simple_linear/scenarios/basic.json' );
    } );

    it( 'should handle nested workflow directories', async () => {
      mockCatalog( [ { name: 'deep_flow', path: '/app/dist/workflows/category/sub/deep_flow/workflow.js' } ] );
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        return String( path ).includes( 'src/workflows/category/sub/deep_flow/scenarios/test.json' );
      } );

      const result = await resolveScenarioPath( 'deep_flow', 'test', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'src/workflows/category/sub/deep_flow/scenarios/test.json' );
    } );

    it( 'should return not found when scenario file does not exist', async () => {
      mockCatalog( [ { name: 'my_workflow', path: '/app/dist/workflows/my_workflow/workflow.js' } ] );
      vi.mocked( fs.existsSync ).mockReturnValue( false );

      const result = await resolveScenarioPath( 'my_workflow', 'missing', '/project' );

      expect( result.found ).toBe( false );
      expect( result.searchedPaths.length ).toBeGreaterThanOrEqual( 2 );
    } );

    it( 'should fall back to convention when catalog path has no scenario but convention does', async () => {
      mockCatalog( [ { name: 'renamedFlow', path: '/app/dist/workflows/actual_folder/workflow.js' } ] );
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        // Not found at catalog-resolved path, but found at convention path
        return String( path ).includes( 'src/workflows/renamedFlow/scenarios/test.json' );
      } );

      const result = await resolveScenarioPath( 'renamedFlow', 'test', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'src/workflows/renamedFlow/scenarios/test.json' );
    } );
  } );

  describe( 'when API is unavailable', () => {
    it( 'should fall back to convention-based lookup', async () => {
      mockCatalogFailure();
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        return String( path ).includes( 'src/workflows/my_workflow/scenarios/test_scenario.json' );
      } );

      const result = await resolveScenarioPath( 'my_workflow', 'test_scenario', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'src/workflows/my_workflow/scenarios/test_scenario.json' );
    } );
  } );

  describe( 'when workflow is not in catalog', () => {
    it( 'should fall back to convention-based lookup', async () => {
      mockCatalog( [ { name: 'other_workflow', path: '/app/dist/workflows/other/workflow.js' } ] );
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        return String( path ).includes( 'src/workflows/my_workflow/scenarios/test.json' );
      } );

      const result = await resolveScenarioPath( 'my_workflow', 'test', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'src/workflows/my_workflow/scenarios/test.json' );
    } );
  } );

  describe( 'json extension normalization', () => {
    it( 'should handle scenario name with .json extension', async () => {
      mockCatalogFailure();
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        return String( path ).includes( 'src/workflows/my_workflow/scenarios/test_scenario.json' );
      } );

      const result = await resolveScenarioPath( 'my_workflow', 'test_scenario.json', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'test_scenario.json' );
      expect( result.path ).not.toContain( 'test_scenario.json.json' );
    } );
  } );

  describe( 'workflows fallback directory', () => {
    it( 'should find scenario in workflows/ fallback path', async () => {
      mockCatalogFailure();
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        return String( path ).includes( 'workflows/my_workflow/scenarios/test_scenario.json' ) &&
               !String( path ).includes( 'src/workflows' );
      } );

      const result = await resolveScenarioPath( 'my_workflow', 'test_scenario', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'workflows/my_workflow/scenarios/test_scenario.json' );
    } );
  } );

  describe( 'subdirectory scenarios', () => {
    it( 'should support subdirectory paths in scenario name', async () => {
      mockCatalogFailure();
      vi.mocked( fs.existsSync ).mockImplementation( path => {
        return String( path ).includes( 'src/workflows/my_workflow/scenarios/complex/deep_test.json' );
      } );

      const result = await resolveScenarioPath( 'my_workflow', 'complex/deep_test', '/project' );

      expect( result.found ).toBe( true );
      expect( result.path ).toContain( 'complex/deep_test.json' );
    } );
  } );
} );

describe( 'listScenariosForWorkflow', () => {
  beforeEach( () => {
    vi.resetAllMocks();
  } );

  it( 'should return scenario names from scenarios directory', () => {
    vi.mocked( fs.existsSync ).mockImplementation( path =>
      String( path ).includes( 'src/workflows/my_workflow/scenarios' )
    );
    vi.mocked( fs.readdirSync ).mockReturnValue(
      [ 'basic.json', 'advanced.json', 'README.md' ] as never
    );

    const result = listScenariosForWorkflow( 'my_workflow', undefined, '/project' );

    expect( result ).toEqual( [ 'basic', 'advanced' ] );
  } );

  it( 'should use workflowPath from catalog to derive directory', () => {
    vi.mocked( fs.existsSync ).mockImplementation( path =>
      String( path ).includes( 'src/workflows/viz_examples/01_simple_linear/scenarios' )
    );
    vi.mocked( fs.readdirSync ).mockReturnValue( [ 'test.json' ] as never );

    const result = listScenariosForWorkflow(
      'simpleLinear',
      '/app/dist/workflows/viz_examples/01_simple_linear/workflow.js',
      '/project'
    );

    expect( result ).toEqual( [ 'test' ] );
  } );

  it( 'should fall back to workflowName when workflowPath is undefined', () => {
    vi.mocked( fs.existsSync ).mockImplementation( path =>
      String( path ).includes( 'src/workflows/my_workflow/scenarios' )
    );
    vi.mocked( fs.readdirSync ).mockReturnValue( [ 'scenario_a.json' ] as never );

    const result = listScenariosForWorkflow( 'my_workflow', undefined, '/project' );

    expect( result ).toEqual( [ 'scenario_a' ] );
  } );

  it( 'should fall back to workflowName when path extraction returns null', () => {
    vi.mocked( fs.existsSync ).mockImplementation( path =>
      String( path ).includes( 'src/workflows/my_workflow/scenarios' )
    );
    vi.mocked( fs.readdirSync ).mockReturnValue( [ 'test.json' ] as never );

    const result = listScenariosForWorkflow( 'my_workflow', '/invalid/path.js', '/project' );

    expect( result ).toEqual( [ 'test' ] );
  } );

  it( 'should return empty array when no scenarios directory exists', () => {
    vi.mocked( fs.existsSync ).mockReturnValue( false );

    const result = listScenariosForWorkflow( 'my_workflow', undefined, '/project' );

    expect( result ).toEqual( [] );
  } );

  it( 'should try workflows/ fallback when src/workflows/ does not exist', () => {
    vi.mocked( fs.existsSync ).mockImplementation( path => {
      const p = String( path );
      return p.includes( 'workflows/my_workflow/scenarios' ) && !p.includes( 'src/workflows' );
    } );
    vi.mocked( fs.readdirSync ).mockReturnValue( [ 'fallback.json' ] as never );

    const result = listScenariosForWorkflow( 'my_workflow', undefined, '/project' );

    expect( result ).toEqual( [ 'fallback' ] );
  } );

  it( 'should return empty array for empty scenarios directory', () => {
    vi.mocked( fs.existsSync ).mockReturnValue( true );
    vi.mocked( fs.readdirSync ).mockReturnValue( [] as never );

    const result = listScenariosForWorkflow( 'my_workflow', undefined, '/project' );

    expect( result ).toEqual( [] );
  } );
} );

describe( 'getScenarioNotFoundMessage', () => {
  it( 'should return a helpful error message', () => {
    const searchedPaths = [
      '/project/src/workflows/my_workflow/scenarios/test.json',
      '/project/workflows/my_workflow/scenarios/test.json'
    ];

    const message = getScenarioNotFoundMessage( 'my_workflow', 'test', searchedPaths );

    expect( message ).toContain( 'Scenario \'test\' not found for workflow \'my_workflow\'' );
    expect( message ).toContain( 'Searched in:' );
    expect( message ).toContain( searchedPaths[0] );
    expect( message ).toContain( searchedPaths[1] );
    expect( message ).toContain( 'Tip:' );
    expect( message ).toContain( '--input' );
  } );
} );
