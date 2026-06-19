import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the activity interceptor so the real interceptors/index.js imports cleanly.
vi.mock( './interceptors/activity.js', () => ( { ActivityExecutionInterceptor: class {} } ) );

vi.mock( '@temporalio/worker', () => ( {
  bundleWorkflowCode: vi.fn().mockResolvedValue( { code: '', sourceMap: '' } )
} ) );

vi.mock( './loader/workflows.js', () => ( {
  loadWorkflows: vi.fn().mockResolvedValue( { workflows: [], entrypoint: '/fake/workflows/entrypoint.js' } )
} ) );

vi.mock( './loader/activities.js', () => ( {
  loadActivities: vi.fn().mockResolvedValue( { activities: {} } )
} ) );

vi.mock( './bundler_options.js', () => ( { webpackConfigHook: vi.fn() } ) );

import { bundleWorkflowCode } from '@temporalio/worker';
import { loadWorkflows } from './loader/workflows.js';
import { loadActivities } from './loader/activities.js';
import { webpackConfigHook } from './bundler_options.js';
import { initInterceptors } from './interceptors/index.js';
import { workflowInterceptorModules } from './interceptors/modules.js';
import { bundleWorkflows } from './bundle.js';

describe( 'output-worker --check parity', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    loadWorkflows.mockResolvedValue( { workflows: [], entrypoint: '/fake/workflows/entrypoint.js' } );
    loadActivities.mockResolvedValue( { activities: {} } );
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
    expect( bundleWorkflowCode ).toHaveBeenCalledWith( {
      workflowsPath: '/fake/workflows/entrypoint.js',
      workflowInterceptorModules,
      webpackConfigHook
    } );
  } );
} );
