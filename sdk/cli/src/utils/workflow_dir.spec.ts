import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveWorkflowDir } from './workflow_dir.js';
import * as fs from 'node:fs';
import * as catalog from '#api/workflow_catalog.js';

vi.mock( 'node:fs', () => ( {
  existsSync: vi.fn()
} ) );

vi.mock( '#api/workflow_catalog.js', () => ( {
  fetchWorkflowCatalog: vi.fn()
} ) );

function mockCatalog( workflows: Array<{ name: string; path?: string }> ) {
  vi.mocked( catalog.fetchWorkflowCatalog ).mockResolvedValue( workflows as never );
}

function mockCatalogFailure() {
  vi.mocked( catalog.fetchWorkflowCatalog ).mockRejectedValue( new Error( 'API unavailable' ) );
}

describe( 'resolveWorkflowDir', () => {
  beforeEach( () => {
    vi.resetAllMocks();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'resolves a flat layout without querying the catalog', async () => {
    vi.mocked( fs.existsSync ).mockImplementation( path =>
      String( path ) === '/project/src/workflows/simple'
    );

    const result = await resolveWorkflowDir( 'simple', '/project' );

    expect( result ).toBe( '/project/src/workflows/simple' );
    expect( catalog.fetchWorkflowCatalog ).not.toHaveBeenCalled();
  } );

  it( 'resolves the workflows/ fallback without querying the catalog', async () => {
    vi.mocked( fs.existsSync ).mockImplementation( path =>
      String( path ) === '/project/workflows/simple'
    );

    const result = await resolveWorkflowDir( 'simple', '/project' );

    expect( result ).toBe( '/project/workflows/simple' );
    expect( catalog.fetchWorkflowCatalog ).not.toHaveBeenCalled();
  } );

  it( 'resolves a nested folder via the catalog path', async () => {
    mockCatalog( [ { name: 'a_b_c', path: '/app/dist/workflows/a/b/c/workflow.js' } ] );
    vi.mocked( fs.existsSync ).mockImplementation( path =>
      String( path ) === '/project/src/workflows/a/b/c'
    );

    const result = await resolveWorkflowDir( 'a_b_c', '/project' );

    expect( result ).toBe( '/project/src/workflows/a/b/c' );
  } );

  it( 'returns null when the catalog is unavailable and no flat dir exists', async () => {
    mockCatalogFailure();
    vi.mocked( fs.existsSync ).mockReturnValue( false );

    const result = await resolveWorkflowDir( 'a_b_c', '/project' );

    expect( result ).toBeNull();
  } );

  it( 'returns null when the workflow is not in the catalog', async () => {
    mockCatalog( [ { name: 'other', path: '/app/dist/workflows/other/workflow.js' } ] );
    vi.mocked( fs.existsSync ).mockReturnValue( false );

    const result = await resolveWorkflowDir( 'a_b_c', '/project' );

    expect( result ).toBeNull();
  } );

  it( 'uses a provided workflowPath without querying the catalog', async () => {
    vi.mocked( fs.existsSync ).mockImplementation( path =>
      String( path ) === '/project/src/workflows/writing/editor'
    );

    const result = await resolveWorkflowDir(
      'writing_editor',
      '/project',
      '/app/build-output/writing/editor/workflow.js'
    );

    expect( result ).toBe( '/project/src/workflows/writing/editor' );
    expect( catalog.fetchWorkflowCatalog ).not.toHaveBeenCalled();
  } );
} );
