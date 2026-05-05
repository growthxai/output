import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { staticMatchers } from './loader_tools.js';

vi.mock( '#consts', () => ( {
  ACTIVITY_SEND_HTTP_REQUEST: '__internal#sendHttpRequest',
  ACTIVITY_GET_TRACE_DESTINATIONS: '__internal#getTraceDestinations',
  WORKFLOWS_INDEX_FILENAME: '__workflows_entrypoint.js',
  WORKFLOW_CATALOG: 'catalog',
  ACTIVITY_OPTIONS_FILENAME: '__activity_options.js',
  SHARED_STEP_PREFIX: '$shared'
} ) );

const sendHttpRequestMock = vi.fn();
const getTraceDestinationsMock = vi.fn();
vi.mock( '#internal_activities', () => ( {
  sendHttpRequest: sendHttpRequestMock,
  getTraceDestinations: getTraceDestinationsMock
} ) );

const { importComponentsMock, findSharedActivitiesFromWorkflowsMock, findWorkflowsInNodeModulesMock, matchFilesMock } = vi.hoisted( () => ( {
  importComponentsMock: vi.fn(),
  findSharedActivitiesFromWorkflowsMock: vi.fn(),
  findWorkflowsInNodeModulesMock: vi.fn(),
  matchFilesMock: vi.fn()
} ) );

vi.mock( './loader_tools.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    importComponents: importComponentsMock,
    findSharedActivitiesFromWorkflows: findSharedActivitiesFromWorkflowsMock,
    findWorkflowsInNodeModules: findWorkflowsInNodeModulesMock,
    matchFiles: matchFilesMock
  };
} );

const fsMocks = vi.hoisted( () => ( {
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue( false )
} ) );
vi.mock( 'node:fs', () => ( {
  mkdirSync: fsMocks.mkdirSync,
  writeFileSync: fsMocks.writeFileSync,
  existsSync: fsMocks.existsSync
} ) );

describe( 'worker/loader', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    importComponentsMock.mockReset();
    importComponentsMock.mockImplementation( async function *() {} );
    findSharedActivitiesFromWorkflowsMock.mockReset();
    findSharedActivitiesFromWorkflowsMock.mockReturnValue( [] );
    findWorkflowsInNodeModulesMock.mockReset();
    findWorkflowsInNodeModulesMock.mockReturnValue( [] );
    matchFilesMock.mockReset();
    matchFilesMock.mockReturnValue( [] );
  } );

  it( 'loadActivities returns map including system activity and writes options file', async () => {
    const { loadActivities } = await import( './loader.js' );

    importComponentsMock.mockImplementationOnce( async function *() {
      yield {
        fn: () => {},
        metadata: { name: 'Act1', options: { activityOptions: { retry: { maximumAttempts: 3 } } } },
        path: '/a/steps.js'
      };
    } );
    importComponentsMock.mockImplementationOnce( async function *() {} );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const activities = await loadActivities( '/root', workflows );
    expect( activities['A#Act1'] ).toBeTypeOf( 'function' );
    expect( activities['__internal#sendHttpRequest'] ).toBe( sendHttpRequestMock );

    expect( fsMocks.writeFileSync ).toHaveBeenCalledTimes( 1 );
    const [ writtenPath, contents ] = fsMocks.writeFileSync.mock.calls[0];
    expect( writtenPath ).toMatch( /temp\/__activity_options\.js$/ );
    expect( contents ).toContain( 'export default' );
    expect( JSON.parse( contents.replace( /^export default\s*/, '' ).replace( /;\s*$/, '' ) ) ).toEqual( {
      'A#Act1': { retry: { maximumAttempts: 3 } }
    } );
    expect( fsMocks.mkdirSync ).toHaveBeenCalled();
  } );

  it( 'loadActivities omits activity options when component has no options or no activityOptions', async () => {
    const { loadActivities } = await import( './loader.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'NoOptions' }, path: '/a/steps.js' };
      yield { fn: () => {}, metadata: { name: 'EmptyOptions', options: {} }, path: '/a/steps2.js' };
    } );
    importComponentsMock.mockImplementationOnce( async function *() {} );

    await loadActivities( '/root', [ { name: 'A', path: '/a/workflow.js' } ] );
    const written = JSON.parse(
      fsMocks.writeFileSync.mock.calls[0][1].replace( /^export default\s*/, '' ).replace( /;\s*$/, '' )
    );
    expect( written['A#NoOptions'] ).toBeUndefined();
    expect( written['A#EmptyOptions'] ).toBeUndefined();
  } );

  describe( 'loadWorkflows', () => {
    it( 'returns local workflows from importComponents with metadata spread onto each entry', async () => {
      const { loadWorkflows } = await import( './loader.js' );
      const localFiles = [ { path: '/b/workflow.js', url: 'file:///b/workflow.js' } ];
      matchFilesMock.mockReturnValueOnce( localFiles );

      importComponentsMock.mockImplementationOnce( async function *() {
        yield { metadata: { name: 'Flow1', description: 'd' }, path: '/b/workflow.js' };
      } );

      const workflows = await loadWorkflows( '/root' );
      expect( workflows ).toEqual( [ { name: 'Flow1', description: 'd', path: '/b/workflow.js' } ] );
      expect( importComponentsMock ).toHaveBeenNthCalledWith( 1, localFiles );
      expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledOnce();
      expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledWith( '/root' );
    } );

    it( 'calls matchFiles with rootDir and workflowFile matcher', async () => {
      const { loadWorkflows } = await import( './loader.js' );
      const localFiles = [ { path: '/my/app/workflow.js', url: 'file:///my/app/workflow.js' } ];
      const externalFiles = [ { path: '/my/app/node_modules/pkg/workflow.js', url: 'file:///my/app/node_modules/pkg/workflow.js' } ];
      matchFilesMock.mockReturnValueOnce( localFiles );
      findWorkflowsInNodeModulesMock.mockReturnValue( externalFiles );

      await loadWorkflows( '/my/app' );

      expect( matchFilesMock ).toHaveBeenCalledOnce();
      expect( matchFilesMock ).toHaveBeenCalledWith( '/my/app', [ staticMatchers.workflowFile ] );
      expect( importComponentsMock ).toHaveBeenCalledTimes( 2 );
      expect( importComponentsMock ).toHaveBeenNthCalledWith( 1, localFiles );
      expect( importComponentsMock ).toHaveBeenNthCalledWith( 2, externalFiles );
      expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledOnce();
      expect( findWorkflowsInNodeModulesMock ).toHaveBeenCalledWith( '/my/app' );
    } );

    it( 'appends node_modules workflows after local ones and sets external: true', async () => {
      const { loadWorkflows } = await import( './loader.js' );

      importComponentsMock.mockImplementationOnce( async function *() {
        yield { metadata: { name: 'LocalFlow', description: 'local' }, path: '/my/app/workflows/wf/workflow.js' };
      } );
      importComponentsMock.mockImplementationOnce( async function *() {
        yield {
          metadata: { name: '__sum_numbers', description: 'from catalog' },
          path: '/my/app/node_modules/catalog_pkg/src/w/workflow.js'
        };
      } );
      findWorkflowsInNodeModulesMock.mockReturnValue( [ { path: '/my/app/node_modules/catalog_pkg/src/w/workflow.js' } ] );

      const workflows = await loadWorkflows( '/my/app' );
      expect( workflows ).toEqual( [
        { name: 'LocalFlow', description: 'local', path: '/my/app/workflows/wf/workflow.js' },
        {
          name: '__sum_numbers',
          description: 'from catalog',
          path: '/my/app/node_modules/catalog_pkg/src/w/workflow.js',
          external: true
        }
      ] );
    } );

    it( 'returns only external workflows when the project root has none', async () => {
      const { loadWorkflows } = await import( './loader.js' );

      importComponentsMock.mockImplementationOnce( async function *() {} );
      importComponentsMock.mockImplementationOnce( async function *() {
        yield { metadata: { name: 'PkgFlow', description: 'pkg' }, path: '/proj/node_modules/a/w/workflow.js' };
      } );
      findWorkflowsInNodeModulesMock.mockReturnValue( [ { path: '/proj/node_modules/a/w/workflow.js' } ] );

      const workflows = await loadWorkflows( '/proj' );
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
      const { loadWorkflows } = await import( './loader.js' );
      importComponentsMock.mockImplementationOnce( async function *() {
        yield { metadata: { name: 'Invalid' }, path: '/root/shared/workflow.js' };
      } );

      await expect( loadWorkflows( '/root' ) ).rejects.toThrow( 'Workflow directory can\'t be named "shared"' );
      expect( findWorkflowsInNodeModulesMock ).not.toHaveBeenCalled();
    } );
  } );

  it( 'createWorkflowsEntryPoint writes index and returns its path', async () => {
    const { createWorkflowsEntryPoint } = await import( './loader.js' );

    const workflows = [ { name: 'W', path: '/abs/wf.js' } ];
    const entry = createWorkflowsEntryPoint( workflows );

    expect( fsMocks.writeFileSync ).toHaveBeenCalledTimes( 1 );
    const [ writtenPath, contents ] = fsMocks.writeFileSync.mock.calls[0];
    expect( entry ).toBe( writtenPath );
    expect( contents ).toContain( 'export { default as W } from \'/abs/wf.js\';' );
    expect( contents ).toContain( 'export { default as catalog }' );
    expect( fsMocks.mkdirSync ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'createWorkflowsEntryPoint generates alias exports', async () => {
    const { createWorkflowsEntryPoint } = await import( './loader.js' );

    const workflows = [ { name: 'W', path: '/abs/wf.js', aliases: [ 'W_old', 'W_legacy' ] } ];
    createWorkflowsEntryPoint( workflows );

    const [ , contents ] = fsMocks.writeFileSync.mock.calls[0];
    expect( contents ).toContain( 'export { default as W } from \'/abs/wf.js\';' );
    expect( contents ).toContain( 'export { default as W_old } from \'/abs/wf.js\';' );
    expect( contents ).toContain( 'export { default as W_legacy } from \'/abs/wf.js\';' );
  } );

  it( 'createWorkflowsEntryPoint throws on alias conflicting with primary name', async () => {
    const { createWorkflowsEntryPoint } = await import( './loader.js' );

    const workflows = [
      { name: 'alpha', path: '/a.js', aliases: [] },
      { name: 'beta', path: '/b.js', aliases: [ 'alpha' ] }
    ];
    expect( () => createWorkflowsEntryPoint( workflows ) ).toThrow( /Alias "alpha" on workflow "beta" conflicts with workflow "alpha"/ );
  } );

  it( 'createWorkflowsEntryPoint throws on alias conflicting with another alias', async () => {
    const { createWorkflowsEntryPoint } = await import( './loader.js' );

    const workflows = [
      { name: 'alpha', path: '/a.js', aliases: [ 'shared_alias' ] },
      { name: 'beta', path: '/b.js', aliases: [ 'shared_alias' ] }
    ];
    expect( () => createWorkflowsEntryPoint( workflows ) ).toThrow( /Alias "shared_alias" on workflow "beta" conflicts with/ );
  } );

  it( 'createWorkflowsEntryPoint throws on alias identical to own name', async () => {
    const { createWorkflowsEntryPoint } = await import( './loader.js' );

    const workflows = [ { name: 'alpha', path: '/a.js', aliases: [ 'alpha' ] } ];
    expect( () => createWorkflowsEntryPoint( workflows ) ).toThrow( /Workflow "alpha" has an alias identical to its own name/ );
  } );

  it( 'createWorkflowsEntryPoint catches case-insensitive alias collision with primary name', async () => {
    const { createWorkflowsEntryPoint } = await import( './loader.js' );

    const workflows = [
      { name: 'Alpha', path: '/a.js', aliases: [] },
      { name: 'beta', path: '/b.js', aliases: [ 'alpha' ] }
    ];
    expect( () => createWorkflowsEntryPoint( workflows ) ).toThrow( /Alias "alpha" on workflow "beta" conflicts with workflow "Alpha"/ );
  } );

  it( 'createWorkflowsEntryPoint catches case-insensitive alias-to-alias collision', async () => {
    const { createWorkflowsEntryPoint } = await import( './loader.js' );

    const workflows = [
      { name: 'alpha', path: '/a.js', aliases: [ 'Legacy' ] },
      { name: 'beta', path: '/b.js', aliases: [ 'legacy' ] }
    ];
    expect( () => createWorkflowsEntryPoint( workflows ) ).toThrow( /Alias "legacy" on workflow "beta" conflicts with/ );
  } );

  it( 'loadActivities uses folder-based matchers for steps/evaluators and shared', async () => {
    const { loadActivities } = await import( './loader.js' );
    const workflowFiles = [ { path: '/a/steps/foo.js' } ];
    const sharedFiles = [ { path: '/root/shared/steps/baz.js' } ];
    matchFilesMock.mockReturnValueOnce( workflowFiles );
    matchFilesMock.mockReturnValueOnce( sharedFiles );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {} );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    await loadActivities( '/root', workflows );

    expect( matchFilesMock ).toHaveBeenCalledTimes( 2 );
    const [ firstDir, firstMatchers ] = matchFilesMock.mock.calls[0];
    expect( firstDir ).toBe( '/a' );
    expect( Array.isArray( firstMatchers ) ).toBe( true );
    expect( firstMatchers.some( fn => fn( '/a/steps/foo.js' ) ) ).toBe( true );
    expect( firstMatchers.some( fn => fn( '/a/evaluators/bar.js' ) ) ).toBe( true );
    expect( firstMatchers.some( fn => fn( '/a/steps.js' ) ) ).toBe( true );
    expect( firstMatchers.some( fn => fn( '/a/evaluators.js' ) ) ).toBe( true );

    const [ secondDir, secondMatchers ] = matchFilesMock.mock.calls[1];
    expect( secondDir ).toBe( '/root' );
    expect( secondMatchers.some( fn => fn( '/root/shared/steps/baz.js' ) ) ).toBe( true );
    expect( secondMatchers.some( fn => fn( '/root/shared/evaluators/qux.js' ) ) ).toBe( true );

    expect( importComponentsMock ).toHaveBeenCalledTimes( 3 );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 1, workflowFiles );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 2, sharedFiles );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 3, [] );
  } );

  it( 'loads shared activities from external workflow packages', async () => {
    const { loadActivities } = await import( './loader.js' );
    const externalSharedFiles = [ { path: '/root/node_modules/pkg/shared/steps/prepare.js' } ];
    const localWorkflow = { name: 'Local', path: '/root/workflows/local/workflow.js' };
    const externalWorkflow = { name: 'External', path: '/root/node_modules/pkg/workflows/a/workflow.js', external: true };
    findSharedActivitiesFromWorkflowsMock.mockReturnValue( externalSharedFiles );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield {
        fn: () => {},
        metadata: { name: 'ExternalShared', options: { activityOptions: { retry: { maximumAttempts: 2 } } } },
        path: '/root/node_modules/pkg/shared/steps/prepare.js'
      };
    } );

    const activities = await loadActivities( '/root', [ localWorkflow, externalWorkflow ] );

    expect( findSharedActivitiesFromWorkflowsMock ).toHaveBeenCalledWith( [ externalWorkflow ] );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 4, externalSharedFiles );
    expect( activities['$shared#ExternalShared'] ).toBeTypeOf( 'function' );
    const written = JSON.parse(
      fsMocks.writeFileSync.mock.calls[0][1].replace( /^export default\s*/, '' ).replace( /;\s*$/, '' )
    );
    expect( written['$shared#ExternalShared'] ).toEqual( { retry: { maximumAttempts: 2 } } );
  } );

  it( 'loadActivities includes nested workflow steps and shared evaluators', async () => {
    const { loadActivities } = await import( './loader.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'ActNested' }, path: '/a/steps/foo.js' };
    } );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'SharedEval' }, path: '/root/shared/evaluators/bar.js' };
    } );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const activities = await loadActivities( '/root', workflows );
    expect( activities['A#ActNested'] ).toBeTypeOf( 'function' );
    expect( activities['$shared#SharedEval'] ).toBeTypeOf( 'function' );
  } );

  it( 'collects workflow nested steps and evaluators across multiple subfolders', async () => {
    const { loadActivities } = await import( './loader.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'StepPrimary' }, path: '/a/steps/primary/foo.js' };
      yield { fn: () => {}, metadata: { name: 'StepSecondary' }, path: '/a/steps/secondary/bar.js' };
      yield { fn: () => {}, metadata: { name: 'EvalPrimary' }, path: '/a/evaluators/primary/baz.js' };
      yield { fn: () => {}, metadata: { name: 'EvalSecondary' }, path: '/a/evaluators/secondary/qux.js' };
    } );
    importComponentsMock.mockImplementationOnce( async function *() {} );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const activities = await loadActivities( '/root', workflows );
    expect( activities['A#StepPrimary'] ).toBeTypeOf( 'function' );
    expect( activities['A#StepSecondary'] ).toBeTypeOf( 'function' );
    expect( activities['A#EvalPrimary'] ).toBeTypeOf( 'function' );
    expect( activities['A#EvalSecondary'] ).toBeTypeOf( 'function' );
  } );

  it( 'collects shared nested steps and evaluators across multiple subfolders', async () => {
    const { loadActivities } = await import( './loader.js' );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'SharedStepPrimary' }, path: '/root/shared/steps/primary/a.js' };
      yield { fn: () => {}, metadata: { name: 'SharedStepSecondary' }, path: '/root/shared/steps/secondary/b.js' };
      yield { fn: () => {}, metadata: { name: 'SharedEvalPrimary' }, path: '/root/shared/evaluators/primary/c.js' };
      yield { fn: () => {}, metadata: { name: 'SharedEvalSecondary' }, path: '/root/shared/evaluators/secondary/d.js' };
    } );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const activities = await loadActivities( '/root', workflows );
    expect( activities['$shared#SharedStepPrimary'] ).toBeTypeOf( 'function' );
    expect( activities['$shared#SharedStepSecondary'] ).toBeTypeOf( 'function' );
    expect( activities['$shared#SharedEvalPrimary'] ).toBeTypeOf( 'function' );
    expect( activities['$shared#SharedEvalSecondary'] ).toBeTypeOf( 'function' );
  } );

  describe( 'loadHooks', () => {
    it( 'resolves without importing when package.json does not exist', async () => {
      fsMocks.existsSync.mockReturnValue( false );
      const { loadHooks } = await import( './loader.js' );
      await expect( loadHooks( '/root' ) ).resolves.toBeUndefined();
      expect( fsMocks.existsSync ).toHaveBeenCalledWith( join( '/root', 'package.json' ) );
    } );

    it( 'imports hook files listed in package.json output.hookFiles', async () => {
      vi.doUnmock( 'node:fs' );
      vi.resetModules();
      const fs = await import( 'node:fs' );
      const tmpDir = fs.mkdtempSync( join( tmpdir(), 'loader-spec-' ) );
      try {
        fs.writeFileSync( join( tmpDir, 'package.json' ), JSON.stringify( {
          output: { hookFiles: [ 'hook.js' ] }
        } ) );
        fs.writeFileSync( join( tmpDir, 'hook.js' ), 'globalThis.__loadHooksTestLoaded = true;' );

        const { loadHooks } = await import( './loader.js' );
        await loadHooks( tmpDir );
        expect( globalThis.__loadHooksTestLoaded ).toBe( true );
      } finally {
        delete globalThis.__loadHooksTestLoaded;
        fs.rmSync( tmpDir, { recursive: true, force: true } );
      }
    } );
  } );
} );
