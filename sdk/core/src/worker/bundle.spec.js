import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the activity interceptor so the real interceptors/index.js imports cleanly.
vi.mock( './interceptors/activity.js', () => ( { ActivityExecutionInterceptor: class {} } ) );

vi.mock( '@temporalio/worker', () => ( {
  bundleWorkflowCode: vi.fn().mockResolvedValue( { code: '', sourceMap: '' } )
} ) );

vi.mock( './loader.js', () => ( {
  loadWorkflows: vi.fn().mockResolvedValue( [] ),
  loadActivities: vi.fn().mockResolvedValue( {} ),
  createWorkflowsEntryPoint: vi.fn().mockReturnValue( '/fake/workflows/entrypoint.js' )
} ) );

vi.mock( './bundler_options.js', () => ( { webpackConfigHook: vi.fn() } ) );

import { bundleWorkflowCode } from '@temporalio/worker';
import { loadWorkflows, loadActivities, createWorkflowsEntryPoint } from './loader.js';
import { webpackConfigHook } from './bundler_options.js';
import { initInterceptors, workflowInterceptorModules } from './interceptors/index.js';
import { bundleWorkflows } from './bundle.js';

describe( 'output-worker --check parity', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    loadWorkflows.mockResolvedValue( [] );
    loadActivities.mockResolvedValue( {} );
    createWorkflowsEntryPoint.mockReturnValue( '/fake/workflows/entrypoint.js' );
    bundleWorkflowCode.mockResolvedValue( { code: '', sourceMap: '' } );
  } );

  it( 'worker registers the shared workflow interceptor modules', () => {
    const { workflowModules } = initInterceptors( { activities: {}, workflows: [], connection: {} } );
    // The check (bundleWorkflows) and the worker must register the very same modules.
    expect( workflowModules ).toBe( workflowInterceptorModules );
  } );

  it( 'check bundles with the same inputs Worker.create derives', async () => {
    await bundleWorkflows( '/project' );

    expect( loadWorkflows ).toHaveBeenCalledWith( '/project' );
    expect( loadActivities ).toHaveBeenCalledWith( '/project', [] );
    expect( createWorkflowsEntryPoint ).toHaveBeenCalledWith( [] );
    expect( bundleWorkflowCode ).toHaveBeenCalledWith( {
      workflowsPath: '/fake/workflows/entrypoint.js',
      workflowInterceptorModules,
      webpackConfigHook
    } );
  } );
} );
