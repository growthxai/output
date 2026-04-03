import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

const importComponentsMock = vi.fn();
vi.mock( './loader_tools.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, importComponents: importComponentsMock };
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
  } );

  it( 'loadActivities returns map including system activity and writes options file', async () => {
    const { loadActivities } = await import( './loader.js' );

    // First call: workflow directory scan (options.activityOptions propagated to activity options file)
    importComponentsMock.mockImplementationOnce( async function *() {
      yield {
        fn: () => {},
        metadata: { name: 'Act1', options: { activityOptions: { retry: { maximumAttempts: 3 } } } },
        path: '/a/steps.js'
      };
    } );
    // Second call: shared activities scan (no results)
    importComponentsMock.mockImplementationOnce( async function *() {} );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const activities = await loadActivities( '/root', workflows );
    expect( activities['A#Act1'] ).toBeTypeOf( 'function' );
    expect( activities['__internal#sendHttpRequest'] ).toBe( sendHttpRequestMock );

    // options file written with the collected activityOptions map
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

  it( 'loadWorkflows returns array of workflows with metadata', async () => {
    const { loadWorkflows } = await import( './loader.js' );

    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'Flow1', description: 'd' }, path: '/b/workflow.js' };
    } );

    const workflows = await loadWorkflows( '/root' );
    expect( workflows ).toEqual( [ { name: 'Flow1', description: 'd', path: '/b/workflow.js' } ] );
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

  it( 'loadActivities uses folder-based matchers for steps/evaluators and shared', async () => {
    const { loadActivities } = await import( './loader.js' );
    // First call (workflow dir): no results
    importComponentsMock.mockImplementationOnce( async function *() {} );
    // Second call (shared): no results
    importComponentsMock.mockImplementationOnce( async function *() {} );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    await loadActivities( '/root', workflows );

    // First invocation should target the workflow directory with folder/file matchers
    expect( importComponentsMock ).toHaveBeenCalledTimes( 2 );
    const [ firstDir, firstMatchers ] = importComponentsMock.mock.calls[0];
    expect( firstDir ).toBe( '/a' );
    expect( Array.isArray( firstMatchers ) ).toBe( true );
    // Should match folder-based steps and evaluators files
    expect( firstMatchers.some( fn => fn( '/a/steps/foo.js' ) ) ).toBe( true );
    expect( firstMatchers.some( fn => fn( '/a/evaluators/bar.js' ) ) ).toBe( true );
    // And also direct file names
    expect( firstMatchers.some( fn => fn( '/a/steps.js' ) ) ).toBe( true );
    expect( firstMatchers.some( fn => fn( '/a/evaluators.js' ) ) ).toBe( true );

    // Second invocation should target root with shared matchers
    const [ secondDir, secondMatchers ] = importComponentsMock.mock.calls[1];
    expect( secondDir ).toBe( '/root' );
    expect( secondMatchers.some( fn => fn( '/root/shared/steps/baz.js' ) ) ).toBe( true );
    expect( secondMatchers.some( fn => fn( '/root/shared/evaluators/qux.js' ) ) ).toBe( true );
  } );

  it( 'loadActivities includes nested workflow steps and shared evaluators', async () => {
    const { loadActivities } = await import( './loader.js' );
    // Workflow dir scan returns a nested step
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'ActNested' }, path: '/a/steps/foo.js' };
    } );
    // Shared scan returns a shared evaluator
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'SharedEval' }, path: '/root/shared/evaluators/bar.js' };
    } );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const activities = await loadActivities( '/root', workflows );
    expect( activities['A#ActNested'] ).toBeTypeOf( 'function' );
    expect( activities['$shared#SharedEval'] ).toBeTypeOf( 'function' );
  } );

  it( 'loadWorkflows throws when workflow is under shared directory', async () => {
    const { loadWorkflows } = await import( './loader.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { metadata: { name: 'Invalid' }, path: '/root/shared/workflow.js' };
    } );
    await expect( loadWorkflows( '/root' ) ).rejects.toThrow( 'Workflow directory can\'t be named \"shared\"' );
  } );

  it( 'collects workflow nested steps and evaluators across multiple subfolders', async () => {
    const { loadActivities } = await import( './loader.js' );
    // Workflow dir scan returns nested steps and evaluators
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'StepPrimary' }, path: '/a/steps/primary/foo.js' };
      yield { fn: () => {}, metadata: { name: 'StepSecondary' }, path: '/a/steps/secondary/bar.js' };
      yield { fn: () => {}, metadata: { name: 'EvalPrimary' }, path: '/a/evaluators/primary/baz.js' };
      yield { fn: () => {}, metadata: { name: 'EvalSecondary' }, path: '/a/evaluators/secondary/qux.js' };
    } );
    // Shared scan returns nothing for this test
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
    // Workflow dir scan returns nothing for this test
    importComponentsMock.mockImplementationOnce( async function *() {} );
    // Shared scan returns nested steps and evaluators
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
