import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from './generated/api.js';
import { fetchWorkflowCatalog } from './workflow_catalog.js';

vi.mock( './generated/api.js', () => ( {
  getWorkflowCatalog: vi.fn(),
  getWorkflowCatalogId: vi.fn()
} ) );

describe( 'fetchWorkflowCatalog', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'fetches the default catalog when no catalog id is provided', async () => {
    vi.mocked( api.getWorkflowCatalog ).mockResolvedValue( { data: { workflows: [ { name: 'a' } ] } } as never );

    const result = await fetchWorkflowCatalog();

    expect( api.getWorkflowCatalog ).toHaveBeenCalledTimes( 1 );
    expect( api.getWorkflowCatalogId ).not.toHaveBeenCalled();
    expect( result ).toEqual( [ { name: 'a' } ] );
  } );

  it( 'fetches a specific catalog by id when one is provided', async () => {
    vi.mocked( api.getWorkflowCatalogId ).mockResolvedValue( { data: { workflows: [ { name: 'b' } ] } } as never );

    const result = await fetchWorkflowCatalog( 'my-catalog' );

    expect( api.getWorkflowCatalogId ).toHaveBeenCalledWith( 'my-catalog' );
    expect( api.getWorkflowCatalog ).not.toHaveBeenCalled();
    expect( result ).toEqual( [ { name: 'b' } ] );
  } );

  it( 'returns an empty array when the catalog response has no workflows', async () => {
    vi.mocked( api.getWorkflowCatalog ).mockResolvedValue( { data: {} } as never );

    expect( await fetchWorkflowCatalog() ).toEqual( [] );
  } );
} );
