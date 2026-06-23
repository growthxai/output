import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusEventType, ComponentType } from '#consts';

const messageBusMock = vi.hoisted( () => ( {
  emit: vi.fn()
} ) );

const addEventStartMock = vi.hoisted( () => vi.fn() );
const addEventEndMock = vi.hoisted( () => vi.fn() );
const addEventErrorMock = vi.hoisted( () => vi.fn() );

const createWorkflowDetailsMock = vi.hoisted( () => vi.fn( workflowInfo => ( {
  workflowId: workflowInfo.workflowId,
  workflowType: workflowInfo.workflowType,
  runId: workflowInfo.runId
} ) ) );

vi.mock( '#bus', () => ( { messageBus: messageBusMock } ) );
vi.mock( '#tracing', () => ( {
  addEventStart: addEventStartMock,
  addEventEnd: addEventEndMock,
  addEventError: addEventErrorMock
} ) );
vi.mock( '#internal_utils/temporal_context', () => ( {
  createWorkflowDetails: createWorkflowDetailsMock
} ) );

describe( 'worker/sinks', () => {
  const workflowInfo = {
    workflowId: 'wf-1',
    workflowType: 'myWorkflow',
    runId: 'run-1',
    memo: {
      traceInfo: { traceId: 'trace-1' }
    },
    parent: {
      runId: 'parent-run-1'
    }
  };
  const workflowDetails = {
    workflowId: 'wf-1',
    workflowType: 'myWorkflow',
    runId: 'run-1'
  };

  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'disables replay calls for side-effecting sinks', async () => {
    const { sinks } = await import( './sinks.js' );

    expect( sinks.workflow.start.callDuringReplay ).toBe( false );
    expect( sinks.workflow.end.callDuringReplay ).toBe( false );
    expect( sinks.workflow.error.callDuringReplay ).toBe( false );
    expect( sinks.trace.start.callDuringReplay ).toBe( false );
    expect( sinks.trace.end.callDuringReplay ).toBe( false );
    expect( sinks.trace.error.callDuringReplay ).toBe( false );
  } );

  it( 'workflow.log emits workflow log events with metadata and workflow details', async () => {
    const { sinks } = await import( './sinks.js' );
    const metadata = { requestId: 'req-1' };

    sinks.workflow.log.fn( workflowInfo, {
      level: 'info',
      message: 'workflow detail',
      metadata
    } );

    expect( createWorkflowDetailsMock ).toHaveBeenCalledWith( workflowInfo );
    expect( messageBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKFLOW_LOG, {
      level: 'info',
      message: 'workflow detail',
      metadata,
      workflowDetails
    } );
  } );

  it( 'workflow.start emits workflow start events and trace start events', async () => {
    const { sinks } = await import( './sinks.js' );
    const input = { value: 'input' };

    sinks.workflow.start.fn( workflowInfo, input );

    expect( messageBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKFLOW_START, { workflowDetails } );
    expect( addEventStartMock ).toHaveBeenCalledWith( {
      id: 'run-1',
      kind: ComponentType.WORKFLOW,
      name: 'myWorkflow',
      details: input,
      parentId: 'parent-run-1',
      traceInfo: { traceId: 'trace-1' }
    } );
  } );

  it( 'workflow.start skips tracing when trace info is absent', async () => {
    const { sinks } = await import( './sinks.js' );

    sinks.workflow.start.fn( { ...workflowInfo, memo: {} }, { value: 'input' } );

    expect( messageBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKFLOW_START, { workflowDetails } );
    expect( addEventStartMock ).not.toHaveBeenCalled();
  } );

  it( 'workflow.end emits workflow end events and trace end events', async () => {
    const { sinks } = await import( './sinks.js' );
    const output = { value: 'output' };

    sinks.workflow.end.fn( workflowInfo, output );

    expect( messageBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKFLOW_END, { workflowDetails } );
    expect( addEventEndMock ).toHaveBeenCalledWith( {
      id: 'run-1',
      details: output,
      traceInfo: { traceId: 'trace-1' }
    } );
  } );

  it( 'workflow.end skips tracing when trace info is absent', async () => {
    const { sinks } = await import( './sinks.js' );

    sinks.workflow.end.fn( { ...workflowInfo, memo: {} }, { value: 'output' } );

    expect( messageBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKFLOW_END, { workflowDetails } );
    expect( addEventEndMock ).not.toHaveBeenCalled();
  } );

  it( 'workflow.error emits workflow error events and trace error events', async () => {
    const { sinks } = await import( './sinks.js' );
    const error = new Error( 'workflow failed' );

    sinks.workflow.error.fn( workflowInfo, error );

    expect( messageBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKFLOW_ERROR, { workflowDetails, error } );
    expect( addEventErrorMock ).toHaveBeenCalledWith( {
      id: 'run-1',
      details: error,
      traceInfo: { traceId: 'trace-1' }
    } );
  } );

  it( 'workflow.error skips tracing when trace info is absent', async () => {
    const { sinks } = await import( './sinks.js' );
    const error = new Error( 'workflow failed' );

    sinks.workflow.error.fn( { ...workflowInfo, memo: {} }, error );

    expect( messageBusMock.emit ).toHaveBeenCalledWith( BusEventType.WORKFLOW_ERROR, { workflowDetails, error } );
    expect( addEventErrorMock ).not.toHaveBeenCalled();
  } );

  it( 'trace.start records trace start events with workflow parent context', async () => {
    const { sinks } = await import( './sinks.js' );

    sinks.trace.start.fn( workflowInfo, {
      id: 'step-1',
      kind: ComponentType.STEP,
      name: 'myStep',
      details: { input: true }
    } );

    expect( addEventStartMock ).toHaveBeenCalledWith( {
      id: 'step-1',
      kind: ComponentType.STEP,
      name: 'myStep',
      details: { input: true },
      parentId: 'parent-run-1',
      traceInfo: { traceId: 'trace-1' }
    } );
  } );

  it( 'trace.end records trace end events', async () => {
    const { sinks } = await import( './sinks.js' );

    sinks.trace.end.fn( workflowInfo, {
      id: 'step-1',
      details: { output: true }
    } );

    expect( addEventEndMock ).toHaveBeenCalledWith( {
      id: 'step-1',
      details: { output: true },
      traceInfo: { traceId: 'trace-1' }
    } );
  } );

  it( 'trace.error records trace error events', async () => {
    const { sinks } = await import( './sinks.js' );
    const error = new Error( 'step failed' );

    sinks.trace.error.fn( workflowInfo, {
      id: 'step-1',
      details: error
    } );

    expect( addEventErrorMock ).toHaveBeenCalledWith( {
      id: 'step-1',
      details: error,
      traceInfo: { traceId: 'trace-1' }
    } );
  } );
} );
