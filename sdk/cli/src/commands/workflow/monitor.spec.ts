/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#services/workflow_history.js', () => ( { fetchWorkflowHistory: vi.fn() } ) );
vi.mock( '#utils/sleep.js', () => ( { sleep: vi.fn().mockResolvedValue( undefined ) } ) );

const span = ( id: string, status: string, overrides: Record<string, unknown> = {} ): Record<string, unknown> => ( {
  id,
  name: `Step ${id}`,
  technicalName: `wf#step${id}`,
  description: null,
  status,
  kind: 'activity',
  attempt: 1,
  startedAt: null,
  scheduledAt: null,
  completedAt: null,
  startOffsetMs: 0,
  endOffsetMs: 0,
  durationMs: 1000,
  failureMessage: null,
  ...overrides
} );

const history = ( status: string, overrides: Record<string, unknown> = {} ): Record<string, unknown> => ( {
  workflow: { status },
  runId: 'run-1',
  events: [],
  spans: [],
  totalDurationMs: 0,
  continuedAsNewRunId: null,
  ...overrides
} );

describe( 'workflow monitor command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  } );

  describe( 'command definition', () => {
    it( 'exports a valid OCLIF command with a required workflowId arg', async () => {
      const WorkflowMonitor = ( await import( './monitor.js' ) ).default;
      expect( WorkflowMonitor ).toBeDefined();
      expect( WorkflowMonitor.args ).toHaveProperty( 'workflowId' );
      expect( WorkflowMonitor.args.workflowId.required ).toBe( true );
    } );

    it( 'declares the expected flags and defaults', async () => {
      const WorkflowMonitor = ( await import( './monitor.js' ) ).default;
      const flags = WorkflowMonitor.flags;

      expect( flags ).toHaveProperty( 'run-id' );
      expect( flags ).toHaveProperty( 'include-payloads' );
      expect( flags ).toHaveProperty( 'interval' );
      expect( flags ).toHaveProperty( 'color' );
      expect( flags.format.options ).toEqual( [ 'text', 'json' ] );
      expect( flags.format.default ).toBe( 'text' );
      expect( flags.interval.default ).toBe( 2500 );
      expect( flags.color.default ).toBe( true );
    } );
  } );

  describe( 'run()', () => {
    const createCommand = async ( flagOverrides: Record<string, unknown> = {} ) => {
      const WorkflowMonitor = ( await import( './monitor.js' ) ).default;
      const { fetchWorkflowHistory } = await import( '#services/workflow_history.js' );

      const cmd = new WorkflowMonitor( [ 'wf-1' ], {} as any );
      cmd.log = vi.fn();
      cmd.warn = vi.fn() as any;
      cmd.error = vi.fn( ( message: string ) => {
        throw new Error( message );
      } ) as any;
      ( cmd as any ).parse = vi.fn().mockResolvedValue( {
        args: { workflowId: 'wf-1' },
        flags: {
          'run-id': undefined,
          format: 'text',
          'include-payloads': false,
          interval: 1,
          color: false,
          ...flagOverrides
        }
      } );

      return { cmd, fetchWorkflowHistory: vi.mocked( fetchWorkflowHistory ) };
    };

    it( 'prints span updates and exits cleanly when the workflow is already completed on the first poll', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory.mockResolvedValueOnce(
        history( 'completed', { spans: [ span( '1', 'completed' ) ], totalDurationMs: 5000 } ) as any
      );

      await cmd.run();

      expect( fetchWorkflowHistory ).toHaveBeenCalledTimes( 1 );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'Step 1' ) );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'workflow completed' ) );
      expect( process.exitCode ).toBeUndefined();
    } );

    it( 'sets exit code 1 when the workflow ends in a failed status', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory.mockResolvedValueOnce( history( 'failed', {
        spans: [ span( '1', 'failed', { failureMessage: 'boom' } ) ], totalDurationMs: 1000
      } ) as any );

      await cmd.run();

      expect( process.exitCode ).toBe( 1 );
    } );

    it( 'polls again while the workflow is running, then stops once it completes', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory
        .mockResolvedValueOnce( history( 'running', { spans: [ span( '1', 'running' ) ] } ) as any )
        .mockResolvedValueOnce( history( 'completed', {
          spans: [ span( '1', 'completed' ) ], totalDurationMs: 2000
        } ) as any );

      await cmd.run();

      expect( fetchWorkflowHistory ).toHaveBeenCalledTimes( 2 );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'running' ) );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( '1s' ) );
      expect( process.exitCode ).toBeUndefined();
    } );

    it( 'does not re-print a span whose status has not changed between polls', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory
        .mockResolvedValueOnce( history( 'running', { spans: [ span( '1', 'running' ) ] } ) as any )
        .mockResolvedValueOnce( history( 'completed', {
          spans: [ span( '1', 'running' ), span( '2', 'completed' ) ], totalDurationMs: 1000
        } ) as any );

      await cmd.run();

      const runningLines = ( cmd.log as any ).mock.calls.filter( ( [ line ]: [ string ] ) => line.includes( 'Step 1' ) );
      expect( runningLines ).toHaveLength( 1 ); // span 1 only reported once, not again on the second poll
    } );

    it( 'follows a continue-as-new chain by re-polling with the new run id', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory
        .mockResolvedValueOnce( history( 'continued_as_new', { continuedAsNewRunId: 'run-2' } ) as any )
        .mockResolvedValueOnce( history( 'completed', { runId: 'run-2', totalDurationMs: 500 } ) as any );

      await cmd.run();

      expect( fetchWorkflowHistory ).toHaveBeenCalledTimes( 2 );
      expect( fetchWorkflowHistory ).toHaveBeenNthCalledWith( 2, expect.objectContaining( { runId: 'run-2' } ) );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'continued as new run run-2' ) );
      expect( process.exitCode ).toBeUndefined();
    } );

    it( 'errors when the workflow continues as new but no new run id can be determined', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory.mockResolvedValueOnce( history( 'continued_as_new' ) as any );

      await expect( cmd.run() ).rejects.toThrow( /new run ID could not be determined/ );
    } );

    it( 'propagates a failure on the very first poll', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory.mockRejectedValue( new Error( 'network down' ) );

      await expect( cmd.run() ).rejects.toThrow( 'network down' );
      expect( fetchWorkflowHistory ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'retries a transient failure after the first successful poll instead of crashing', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory
        .mockResolvedValueOnce( history( 'running' ) as any )
        .mockRejectedValueOnce( new Error( 'blip' ) )
        .mockResolvedValueOnce( history( 'completed', { totalDurationMs: 1000 } ) as any );

      await cmd.run();

      expect( fetchWorkflowHistory ).toHaveBeenCalledTimes( 3 );
      expect( cmd.warn ).toHaveBeenCalledWith( expect.stringContaining( '(1/5)' ) );
      expect( process.exitCode ).toBeUndefined();
    } );

    it( 'registers a SIGINT handler that detaches and exits 130 without affecting the workflow', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand();
      fetchWorkflowHistory.mockResolvedValueOnce( history( 'completed' ) as any );

      const onSpy = vi.spyOn( process, 'on' );
      const exitSpy = vi.spyOn( process, 'exit' ).mockImplementation( ( () => undefined ) as any );

      await cmd.run();

      const sigintCall = onSpy.mock.calls.find( ( [ event ] ) => event === 'SIGINT' );
      expect( sigintCall ).toBeDefined();
      const handler = sigintCall![1] as () => void;

      handler();

      expect( exitSpy ).toHaveBeenCalledWith( 130 );
      expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'Detached' ) );

      onSpy.mockRestore();
      exitSpy.mockRestore();
    } );

    it( 'emits NDJSON lines under --format json', async () => {
      const { cmd, fetchWorkflowHistory } = await createCommand( { format: 'json' } );
      fetchWorkflowHistory.mockResolvedValueOnce(
        history( 'completed', { spans: [ span( '1', 'completed' ) ], totalDurationMs: 1000 } ) as any
      );

      await cmd.run();

      const lines = ( cmd.log as any ).mock.calls.map( ( [ line ]: [ string ] ) => line );
      expect( lines.some( ( line: string ) => {
        try {
          return JSON.parse( line ).span?.id === '1';
        } catch {
          return false;
        }
      } ) ).toBe( true );
    } );
  } );
} );
