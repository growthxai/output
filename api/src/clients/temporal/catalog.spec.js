import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogNotAvailableError, WorkflowNotFoundError } from '../errors.js';

vi.mock( '#logger', () => ( {
  logger: { info: vi.fn() }
} ) );

describe( 'getCatalog', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'queries the catalog workflow named after the task queue', async () => {
    const catalog = { workflows: [ { name: 'workflow-a' } ] };
    const query = vi.fn().mockResolvedValue( catalog );
    const getHandle = vi.fn().mockReturnValue( { query } );
    const { getCatalog } = await import( './catalog.js' );

    const result = await getCatalog( { client: { workflow: { getHandle } }, taskQueue: 'queue-a' } );

    expect( getHandle ).toHaveBeenCalledWith( 'queue-a' );
    expect( query ).toHaveBeenCalledWith( 'get' );
    expect( result ).toBe( catalog );
  } );

  it( 'maps missing catalog workflow errors to CatalogNotAvailableError', async () => {
    const query = vi.fn().mockRejectedValue( new WorkflowNotFoundError( 'missing catalog' ) );
    const getHandle = vi.fn().mockReturnValue( { query } );
    const { getCatalog } = await import( './catalog.js' );

    const error = await getCatalog( { client: { workflow: { getHandle } }, taskQueue: 'queue-a' } ).catch( e => e );

    expect( error ).toBeInstanceOf( CatalogNotAvailableError );
    expect( error.retryAfter ).toBe( 3 );
  } );

  it( 'annotates and rethrows non-not-found query errors', async () => {
    const error = new Error( 'unavailable' );
    const query = vi.fn().mockRejectedValue( error );
    const getHandle = vi.fn().mockReturnValue( { query } );
    const { getCatalog } = await import( './catalog.js' );

    await expect( getCatalog( { client: { workflow: { getHandle } }, taskQueue: 'queue-a' } ) ).rejects.toBe( error );
    expect( error.taskQueue ).toBe( 'queue-a' );
    expect( error.query ).toBe( 'get' );
  } );
} );

describe( 'resolveWorkflowName', () => {
  it( 'returns an exact workflow name unchanged', async () => {
    const { resolveWorkflowName } = await import( './catalog.js' );

    expect( resolveWorkflowName( { workflows: [ { name: 'workflow-a' } ] }, 'workflow-a', 'queue-a' ) ).toBe( 'workflow-a' );
  } );

  it( 'resolves aliases to the canonical workflow name', async () => {
    const { resolveWorkflowName } = await import( './catalog.js' );

    expect( resolveWorkflowName( {
      workflows: [ { name: 'workflow-a', aliases: [ 'old-workflow-a' ] } ]
    }, 'old-workflow-a', 'queue-a' ) ).toBe( 'workflow-a' );
  } );

  it( 'throws WorkflowNotFoundError when no workflow or alias matches', async () => {
    const { resolveWorkflowName } = await import( './catalog.js' );

    expect( () => resolveWorkflowName( { workflows: [ { name: 'workflow-a' } ] }, 'missing', 'queue-a' ) )
      .toThrow( WorkflowNotFoundError );
  } );
} );
