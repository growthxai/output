import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#consts', () => ( {
  ACTIVITY_SEND_HTTP_REQUEST: '__internal#sendHttpRequest',
  ACTIVITY_GET_TRACE_DESTINATIONS: '__internal#getTraceDestinations',
  WORKFLOWS_INDEX_FILENAME: '__workflows_entrypoint.js',
  WORKFLOW_CATALOG: 'catalog',
  ACTIVITY_OPTIONS_FILENAME: '__activity_options.js',
  SHARED_STEP_PREFIX: '$shared'
} ) );

const { importComponentsMock, findWorkflowsInNodeModulesMock, matchFilesMock, writeFileInTempDirMock } = vi.hoisted( () => ( {
  importComponentsMock: vi.fn(),
  findWorkflowsInNodeModulesMock: vi.fn(),
  matchFilesMock: vi.fn(),
  writeFileInTempDirMock: vi.fn()
} ) );

const { workflowFileMatcherMock, workflowPathHasSharedMock } = vi.hoisted( () => ( {
  workflowFileMatcherMock: vi.fn(),
  workflowPathHasSharedMock: vi.fn()
} ) );

vi.mock( './tools.js', () => ( {
  importComponents: importComponentsMock,
  findWorkflowsInNodeModules: findWorkflowsInNodeModulesMock,
  matchFiles: matchFilesMock,
  writeFileInTempDir: writeFileInTempDirMock
} ) );

vi.mock( './matchers.js', () => ( {
  staticMatchers: {
    workflowFile: workflowFileMatcherMock,
    workflowPathHasShared: workflowPathHasSharedMock
  }
} ) );

describe( 'loadWorkflows', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    importComponentsMock.mockReset();
    importComponentsMock.mockImplementation( async function *() {} );
    findWorkflowsInNodeModulesMock.mockReset();
    findWorkflowsInNodeModulesMock.mockReturnValue( [] );
    matchFilesMock.mockReset();
    matchFilesMock.mockReturnValue( [] );
    writeFileInTempDirMock.mockReset();
    writeFileInTempDirMock.mockReturnValue( '/tmp/__workflows_entrypoint.js' );
    workflowPathHasSharedMock.mockReset();
    workflowPathHasSharedMock.mockReturnValue( false );
  } );

  it( 'returns local workflows from importComponents with metadata spread onto each entry', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    const localFiles = [ { path: '/b/workflow.js', url: 'file:///b/workflow.js' } ];
    matchFilesMock.mockReturnValueOnce( localFiles );

    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'Flow1', description: 'd' }, path: '/b/workflow.js' };
    } );

    const { workflows, entrypoint } = await loadWorkflows( '/root' );
    expect( workflows ).toEqual( [ { name: 'Flow1', description: 'd', path: '/b/workflow.js', external: false } ] );
    expect( entrypoint ).toBe( '/tmp/__workflows_entrypoint.js' );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 1, localFiles );
    expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledOnce();
    expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledWith( '/root' );
  } );

  it( 'calls matchFiles with rootDir and workflowFile matcher', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    const localFiles = [ { path: '/my/app/workflow.js', url: 'file:///my/app/workflow.js' } ];
    const externalFiles = [ { path: '/my/app/node_modules/pkg/workflow.js', url: 'file:///my/app/node_modules/pkg/workflow.js' } ];
    matchFilesMock.mockReturnValueOnce( localFiles );
    findWorkflowsInNodeModulesMock.mockReturnValue( externalFiles );

    await loadWorkflows( '/my/app' );

    expect( matchFilesMock ).toHaveBeenCalledOnce();
    expect( matchFilesMock ).toHaveBeenCalledWith( '/my/app', [ workflowFileMatcherMock ] );
    expect( importComponentsMock ).toHaveBeenCalledTimes( 1 );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 1, [ ...localFiles, ...externalFiles ] );
    expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledOnce();
    expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledWith( '/my/app' );
  } );

  it( 'appends node_modules workflows after local ones and sets external: true', async () => {
    const { loadWorkflows } = await import( './workflows.js' );

    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'LocalFlow', description: 'local' }, path: '/my/app/workflows/wf/workflow.js' };
      yield {
        metadata: { name: '__sum_numbers', description: 'from catalog' },
        path: '/my/app/node_modules/catalog_pkg/src/w/workflow.js'
      };
    } );
    findWorkflowsInNodeModulesMock.mockReturnValue( [ { path: '/my/app/node_modules/catalog_pkg/src/w/workflow.js' } ] );

    const { workflows } = await loadWorkflows( '/my/app' );
    expect( workflows ).toEqual( [
      { name: 'LocalFlow', description: 'local', path: '/my/app/workflows/wf/workflow.js', external: false },
      {
        name: '__sum_numbers',
        description: 'from catalog',
        path: '/my/app/node_modules/catalog_pkg/src/w/workflow.js',
        external: true
      }
    ] );

  } );

  it( 'returns only external workflows when the project root has none', async () => {
    const { loadWorkflows } = await import( './workflows.js' );

    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'PkgFlow', description: 'pkg' }, path: '/proj/node_modules/a/w/workflow.js' };
    } );
    findWorkflowsInNodeModulesMock.mockReturnValue( [ { path: '/proj/node_modules/a/w/workflow.js' } ] );

    const { workflows } = await loadWorkflows( '/proj' );
    expect( workflows ).toEqual( [
      {
        name: 'PkgFlow',
        description: 'pkg',
        path: '/proj/node_modules/a/w/workflow.js',
        external: true
      }
    ] );
  } );

  it( 'throws when a local workflow path is under a shared directory', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'Invalid' }, path: '/root/shared/workflow.js' };
    } );
    workflowPathHasSharedMock.mockReturnValueOnce( true );

    await expect( loadWorkflows( '/root' ) ).rejects.toThrow( 'Workflow directory can\'t be named "shared"' );
    expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledOnce();
    expect( workflowPathHasSharedMock ).toHaveBeenCalledWith( '/root/shared/workflow.js' );
  } );

  it( 'throws when a workflow name conflicts with an earlier workflow name', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'duplicate' }, path: '/root/a/workflow.js' };
      yield { metadata: { name: 'duplicate' }, path: '/root/b/workflow.js' };
    } );

    await expect( loadWorkflows( '/root' ) ).rejects.toThrow(
      'Workflow name "duplicate" conflicts with another workflow or alias. Workflow names and aliases must be unique.'
    );
  } );

  it( 'throws when a workflow name conflicts with an earlier alias', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'alpha', aliases: [ 'legacy' ] }, path: '/root/a/workflow.js' };
      yield { metadata: { name: 'legacy' }, path: '/root/b/workflow.js' };
    } );

    await expect( loadWorkflows( '/root' ) ).rejects.toThrow(
      'Workflow name "legacy" conflicts with another workflow or alias. Workflow names and aliases must be unique.'
    );
  } );

  it( 'throws when an alias conflicts with an earlier workflow name', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'alpha' }, path: '/root/a/workflow.js' };
      yield { metadata: { name: 'beta', aliases: [ 'alpha' ] }, path: '/root/b/workflow.js' };
    } );

    await expect( loadWorkflows( '/root' ) ).rejects.toThrow(
      'Workflow "beta" alias "alpha" conflicts with another workflow or alias. Workflow names and aliases must be unique.'
    );
  } );

  it( 'throws when an alias conflicts with an earlier alias', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'alpha', aliases: [ 'shared_alias' ] }, path: '/root/a/workflow.js' };
      yield { metadata: { name: 'beta', aliases: [ 'shared_alias' ] }, path: '/root/b/workflow.js' };
    } );

    await expect( loadWorkflows( '/root' ) ).rejects.toThrow(
      'Workflow "beta" alias "shared_alias" conflicts with another workflow or alias. Workflow names and aliases must be unique.'
    );
  } );

  it( 'throws when an alias is identical to its workflow name', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'alpha', aliases: [ 'alpha' ] }, path: '/root/a/workflow.js' };
    } );

    await expect( loadWorkflows( '/root' ) ).rejects.toThrow(
      'Workflow "alpha" alias "alpha" conflicts with another workflow or alias. Workflow names and aliases must be unique.'
    );
  } );

  it( 'allows workflow names and aliases that only differ by case', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'Alpha', aliases: [ 'Legacy' ] }, path: '/root/a/workflow.js' };
      yield { metadata: { name: 'alpha', aliases: [ 'legacy' ] }, path: '/root/b/workflow.js' };
    } );

    await expect( loadWorkflows( '/root' ) ).resolves.toMatchObject( {
      workflows: [
        { name: 'Alpha', aliases: [ 'Legacy' ], path: '/root/a/workflow.js', external: false },
        { name: 'alpha', aliases: [ 'legacy' ], path: '/root/b/workflow.js', external: false }
      ]
    } );
  } );

  it( 'throws when a workflow name is reserved for the internal catalog', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'catalog' }, path: '/root/catalog/workflow.js' };
    } );

    await expect( loadWorkflows( '/root' ) ).rejects.toThrow(
      'Workflow name "catalog" is reserved for the internal catalog workflow.'
    );
  } );

  it( 'throws when a workflow alias is reserved for the internal catalog', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'alpha', aliases: [ 'catalog' ] }, path: '/root/a/workflow.js' };
    } );

    await expect( loadWorkflows( '/root' ) ).rejects.toThrow(
      'Workflow "alpha" alias "catalog" is reserved for the internal catalog workflow.'
    );
  } );

  it( 'writes an entrypoint with workflows, aliases, and the catalog workflow', async () => {
    const { loadWorkflows } = await import( './workflows.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'W', aliases: [ 'W_old', 'W_legacy' ] }, path: '/abs/wf.js' };
    } );

    const { entrypoint } = await loadWorkflows( '/root' );

    expect( entrypoint ).toBe( '/tmp/__workflows_entrypoint.js' );
    expect( writeFileInTempDirMock ).toHaveBeenCalledTimes( 1 );
    const [ contents, filename ] = writeFileInTempDirMock.mock.calls[0];
    expect( filename ).toBe( '__workflows_entrypoint.js' );
    expect( contents ).toContain( 'export { default as W } from \'/abs/wf.js\';' );
    expect( contents ).toContain( 'export { default as W_old } from \'/abs/wf.js\';' );
    expect( contents ).toContain( 'export { default as W_legacy } from \'/abs/wf.js\';' );
    expect( contents ).toContain( 'export { default as catalog }' );
  } );
} );
