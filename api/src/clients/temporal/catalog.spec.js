import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogNotAvailableError, UnsupportedWorkflowError, WorkflowNotFoundError } from '../errors.js';

vi.mock( '#logger', () => ( {
  logger: { info: vi.fn() }
} ) );

describe( 'resolveWorkflowName', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'describes the catalog workflow named after the task queue', async () => {
    const describe = vi.fn().mockResolvedValue( { memo: { workflowNames: { 'workflow-a': 'workflow-a' } } } );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const { resolveWorkflowName } = await import( './catalog.js' );

    const result = await resolveWorkflowName( {
      client: { workflow: { getHandle } },
      workflowName: 'workflow-a',
      taskQueue: 'queue-a'
    } );

    expect( getHandle ).toHaveBeenCalledWith( 'queue-a' );
    expect( describe ).toHaveBeenCalled();
    expect( result ).toBe( 'workflow-a' );
  } );

  it( 'maps missing catalog workflow errors to CatalogNotAvailableError', async () => {
    const describe = vi.fn().mockRejectedValue( new WorkflowNotFoundError( 'missing catalog' ) );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const { resolveWorkflowName } = await import( './catalog.js' );

    const error = await resolveWorkflowName( {
      client: { workflow: { getHandle } },
      workflowName: 'workflow-a',
      taskQueue: 'queue-a'
    } ).catch( e => e );

    expect( error ).toBeInstanceOf( CatalogNotAvailableError );
    expect( error.retryAfter ).toBe( 3 );
    expect( error.taskQueue ).toBe( 'queue-a' );
  } );

  it( 'annotates and rethrows non-not-found describe errors', async () => {
    const error = new Error( 'unavailable' );
    const describe = vi.fn().mockRejectedValue( error );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const { resolveWorkflowName } = await import( './catalog.js' );

    await expect( resolveWorkflowName( {
      client: { workflow: { getHandle } },
      workflowName: 'workflow-a',
      taskQueue: 'queue-a'
    } ) ).rejects.toBe( error );
    expect( error.taskQueue ).toBe( 'queue-a' );
  } );

  it( 'returns an exact workflow name unchanged', async () => {
    const describe = vi.fn().mockResolvedValue( { memo: { workflowNames: { 'workflow-a': 'workflow-a' } } } );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const { resolveWorkflowName } = await import( './catalog.js' );

    await expect( resolveWorkflowName( {
      client: { workflow: { getHandle } },
      workflowName: 'workflow-a',
      taskQueue: 'queue-a'
    } ) ).resolves.toBe( 'workflow-a' );
  } );

  it( 'resolves aliases to the canonical workflow name', async () => {
    const describe = vi.fn().mockResolvedValue( { memo: { workflowNames: { 'workflow-a': 'workflow-a', alias: 'workflow-a' } } } );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const { resolveWorkflowName } = await import( './catalog.js' );

    await expect( resolveWorkflowName( {
      client: { workflow: { getHandle } },
      workflowName: 'alias',
      taskQueue: 'queue-a'
    } ) ).resolves.toBe( 'workflow-a' );
  } );

  it( 'throws UnsupportedWorkflowError when no workflow or alias matches', async () => {
    const describe = vi.fn().mockResolvedValue( { memo: { workflowNames: { 'workflow-a': 'workflow-a' } } } );
    const getHandle = vi.fn().mockReturnValue( { describe } );
    const { resolveWorkflowName } = await import( './catalog.js' );

    await expect( resolveWorkflowName( {
      client: { workflow: { getHandle } },
      workflowName: 'missing',
      taskQueue: 'queue-a'
    } ) ).rejects.toBeInstanceOf( UnsupportedWorkflowError );
  } );
} );
