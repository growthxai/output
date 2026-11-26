import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#consts', () => ( {
  ACTIVITY_SEND_HTTP_REQUEST: '__internal#sendHttpRequest',
  ACTIVITY_GET_TRACE_DESTINATIONS: '__internal#getTraceDestinations',
  WORKFLOW_CATALOG: 'catalog'
} ) );

const sendHttpRequestMock = vi.fn();
const getTraceDestinationsMock = vi.fn();
vi.mock( '#internal_activities', () => ( {
  sendHttpRequest: sendHttpRequestMock,
  getTraceDestinations: getTraceDestinationsMock
} ) );

const { importComponentsMock, findSharedActivitiesFromWorkflowsMock, matchFilesMock } = vi.hoisted( () => ( {
  importComponentsMock: vi.fn(),
  findSharedActivitiesFromWorkflowsMock: vi.fn(),
  matchFilesMock: vi.fn()
} ) );

const { buildActivityMatcherMock, activityMatcherMock, sharedStepsDirMock, sharedEvaluatorsDirMock } = vi.hoisted( () => ( {
  buildActivityMatcherMock: vi.fn(),
  activityMatcherMock: vi.fn(),
  sharedStepsDirMock: vi.fn(),
  sharedEvaluatorsDirMock: vi.fn()
} ) );

vi.mock( './tools.js', () => ( {
  importComponents: importComponentsMock,
  findSharedActivitiesFromWorkflows: findSharedActivitiesFromWorkflowsMock,
  matchFiles: matchFilesMock
} ) );

vi.mock( './matchers.js', () => ( {
  buildActivityMatcher: buildActivityMatcherMock,
  staticMatchers: {
    sharedStepsDir: sharedStepsDirMock,
    sharedEvaluatorsDir: sharedEvaluatorsDirMock
  }
} ) );

describe( 'loadActivities', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    importComponentsMock.mockReset();
    importComponentsMock.mockImplementation( async function *() {} );
    findSharedActivitiesFromWorkflowsMock.mockReset();
    findSharedActivitiesFromWorkflowsMock.mockReturnValue( [] );
    matchFilesMock.mockReset();
    matchFilesMock.mockReturnValue( [] );
    buildActivityMatcherMock.mockReset();
    buildActivityMatcherMock.mockReturnValue( activityMatcherMock );
  } );

  it( 'loadActivities returns map including system activity and activity options', async () => {
    const { loadActivities } = await import( './activities.js' );

    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield {
        fn: () => {},
        metadata: { name: 'Act1', options: { activityOptions: { retry: { maximumAttempts: 3 } } } },
        path: '/a/steps.js'
      };
    } );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const { activities, activityOptions } = await loadActivities( '/root', workflows );
    expect( activities['A#Act1'] ).toBeTypeOf( 'function' );
    expect( activities['__internal#sendHttpRequest'] ).toBe( sendHttpRequestMock );
    expect( activityOptions ).toEqual( {
      'A#Act1': { retry: { maximumAttempts: 3 } }
    } );
  } );

  it( 'loadActivities omits activity options when component has no options or no activityOptions', async () => {
    const { loadActivities } = await import( './activities.js' );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'NoOptions' }, path: '/a/steps.js' };
      yield { fn: () => {}, metadata: { name: 'EmptyOptions', options: {} }, path: '/a/steps2.js' };
    } );

    const { activityOptions } = await loadActivities( '/root', [ { name: 'A', path: '/a/workflow.js' } ] );
    expect( activityOptions['A#NoOptions'] ).toBeUndefined();
    expect( activityOptions['A#EmptyOptions'] ).toBeUndefined();
  } );

  it( 'loadActivities throws when two activities in the same workflow share a name', async () => {
    const { loadActivities } = await import( './activities.js' );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'DuplicateActivity' }, path: '/a/steps.js' };
      yield { fn: () => {}, metadata: { name: 'DuplicateActivity' }, path: '/a/evaluators.js' };
    } );

    await expect( loadActivities( '/root', [ { name: 'A', path: '/a/workflow.js' } ] ) ).rejects.toThrow(
      'Activity "DuplicateActivity" in workflow "A" conflicts with another activity in the same workflow. \
Activity names must be unique within a workflow.'
    );
  } );

  it( 'loadActivities throws when two shared activities share a name', async () => {
    const { loadActivities } = await import( './activities.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'DuplicateShared' }, path: '/root/shared/steps/a.js' };
      yield { fn: () => {}, metadata: { name: 'DuplicateShared' }, path: '/root/shared/evaluators/a.js' };
    } );

    await expect( loadActivities( '/root', [ { name: 'A', path: '/a/workflow.js' } ] ) ).rejects.toThrow(
      'Shared activity "DuplicateShared" conflicts with another shared activity. Shared activity names must be unique.'
    );
  } );

  it( 'loadActivities uses activity and shared matchers for workflow and shared scans', async () => {
    const { loadActivities } = await import( './activities.js' );
    const workflowFiles = [ { path: '/a/steps/foo.js' } ];
    const sharedFiles = [ { path: '/root/shared/steps/baz.js' } ];
    matchFilesMock.mockReturnValueOnce( sharedFiles );
    matchFilesMock.mockReturnValueOnce( workflowFiles );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {} );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    await loadActivities( '/root', workflows );

    expect( matchFilesMock ).toHaveBeenCalledTimes( 2 );
    expect( buildActivityMatcherMock ).toHaveBeenCalledWith( '/a' );
    expect( matchFilesMock ).toHaveBeenNthCalledWith( 1, '/root', [ sharedStepsDirMock, sharedEvaluatorsDirMock ] );
    expect( matchFilesMock ).toHaveBeenNthCalledWith( 2, '/a', [ activityMatcherMock ] );

    expect( importComponentsMock ).toHaveBeenCalledTimes( 2 );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 1, sharedFiles );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 2, workflowFiles );
  } );

  it( 'loads shared activities from external workflow packages', async () => {
    const { loadActivities } = await import( './activities.js' );
    const externalSharedFiles = [ { path: '/root/node_modules/pkg/shared/steps/prepare.js' } ];
    const localWorkflow = { name: 'Local', path: '/root/workflows/local/workflow.js' };
    const externalWorkflow = { name: 'External', path: '/root/node_modules/pkg/workflows/a/workflow.js', external: true };
    findSharedActivitiesFromWorkflowsMock.mockReturnValue( externalSharedFiles );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield {
        fn: () => {},
        metadata: { name: 'ExternalShared', options: { activityOptions: { retry: { maximumAttempts: 2 } } } },
        path: '/root/node_modules/pkg/shared/steps/prepare.js'
      };
    } );

    const { activities, activityOptions } = await loadActivities( '/root', [ localWorkflow, externalWorkflow ] );

    expect( findSharedActivitiesFromWorkflowsMock ).toHaveBeenCalledWith( [ externalWorkflow ] );
    expect( importComponentsMock ).toHaveBeenNthCalledWith( 1, externalSharedFiles );
    expect( activities['Local#ExternalShared'] ).toBeTypeOf( 'function' );
    expect( activities['External#ExternalShared'] ).toBeTypeOf( 'function' );
    expect( activityOptions['Local#ExternalShared'] ).toEqual( { retry: { maximumAttempts: 2 } } );
    expect( activityOptions['External#ExternalShared'] ).toEqual( { retry: { maximumAttempts: 2 } } );
  } );

  it( 'loadActivities includes nested workflow steps and shared evaluators', async () => {
    const { loadActivities } = await import( './activities.js' );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'SharedEval' }, path: '/root/shared/evaluators/bar.js' };
    } );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'ActNested' }, path: '/a/steps/foo.js' };
    } );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const { activities } = await loadActivities( '/root', workflows );
    expect( activities['A#ActNested'] ).toBeTypeOf( 'function' );
    expect( activities['A#SharedEval'] ).toBeTypeOf( 'function' );
  } );

  it( 'collects shared nested steps and evaluators across multiple subfolders', async () => {
    const { loadActivities } = await import( './activities.js' );
    importComponentsMock.mockImplementationOnce( async function *() {} );
    importComponentsMock.mockImplementationOnce( async function *() {
      yield { fn: () => {}, metadata: { name: 'SharedStepPrimary' }, path: '/root/shared/steps/primary/a.js' };
      yield { fn: () => {}, metadata: { name: 'SharedStepSecondary' }, path: '/root/shared/steps/secondary/b.js' };
      yield { fn: () => {}, metadata: { name: 'SharedEvalPrimary' }, path: '/root/shared/evaluators/primary/c.js' };
      yield { fn: () => {}, metadata: { name: 'SharedEvalSecondary' }, path: '/root/shared/evaluators/secondary/d.js' };
    } );

    const workflows = [ { name: 'A', path: '/a/workflow.js' } ];
    const { activities } = await loadActivities( '/root', workflows );
    expect( activities['A#SharedStepPrimary'] ).toBeTypeOf( 'function' );
    expect( activities['A#SharedStepSecondary'] ).toBeTypeOf( 'function' );
    expect( activities['A#SharedEvalPrimary'] ).toBeTypeOf( 'function' );
    expect( activities['A#SharedEvalSecondary'] ).toBeTypeOf( 'function' );
  } );
} );
