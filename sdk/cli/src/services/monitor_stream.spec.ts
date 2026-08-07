/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpError } from '#api/http_client.js';
import { commandStreamIo, monitorErrorOverrides, streamWorkflowUpdates } from './monitor_stream.js';

vi.mock( '#services/workflow_history.js', () => ( { fetchWorkflowHistory: vi.fn(), fetchWorkflowHistoryUpdates: vi.fn() } ) );
vi.mock( '#utils/sleep.js', () => ( { sleep: vi.fn().mockResolvedValue( undefined ) } ) );

/**
 * Direct coverage of the loop now that two commands share it. `monitor.spec.ts`
 * exercises it end-to-end through `workflow monitor`, and `start.spec.ts` stubs
 * it out entirely — so what's here is the behavior neither reaches: the return
 * value both callers branch on, the pre-cursor retry cap, the detach guards, and
 * the error classification at its edges.
 */
const cursor = { pageToken: 'token', lastEventId: 1, meta: null, runId: 'run-1', events: [] };

const history = ( status: string, overrides: Record<string, unknown> = {} ): any => ( {
  workflow: { status },
  runId: 'run-1',
  events: [],
  spans: [],
  totalDurationMs: 0,
  continuedAsNewRunId: null,
  cursor,
  ...overrides
} );

const update = ( status: string, overrides: Record<string, unknown> = {} ): any =>
  ( { result: history( status, overrides ), cursor } );

const createIo = ( errorReturns = false ) => ( {
  log: vi.fn(),
  warn: vi.fn(),
  // Typed `never` in the interface but nothing enforces that at runtime, which is
  // exactly what the continue-as-new guard defends against — so both shapes are
  // constructible here.
  error: ( errorReturns ?
    vi.fn() :
    vi.fn( ( message: string ) => {
      throw new Error( message );
    } ) ) as any
} );

const options = ( overrides: Record<string, unknown> = {} ) => ( {
  workflowId: 'wf-1',
  runId: undefined,
  includePayloads: false,
  interval: 5000,
  json: false,
  color: false,
  ...overrides
} );

const flush = () => new Promise( resolve => setImmediate( resolve ) );

describe( 'monitor_stream service', () => {
  beforeEach( async () => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    const { sleep } = await import( '#utils/sleep.js' );
    vi.mocked( sleep ).mockResolvedValue( undefined );
  } );

  afterEach( () => {
    process.exitCode = undefined;
  } );

  const histories = async () => {
    const { fetchWorkflowHistory, fetchWorkflowHistoryUpdates } = await import( '#services/workflow_history.js' );
    return {
      fetchWorkflowHistory: vi.mocked( fetchWorkflowHistory ),
      fetchWorkflowHistoryUpdates: vi.mocked( fetchWorkflowHistoryUpdates )
    };
  };

  describe( 'streamWorkflowUpdates() return value', () => {
    it( 'returns the terminal status it stopped on so the caller can name a follow-up', async () => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory.mockResolvedValueOnce( history( 'completed' ) );

      // `start --monitor` branches on this to print "workflow result" vs
      // "workflow debug"; a boolean or a throw wouldn't carry enough.
      expect( await streamWorkflowUpdates( options(), createIo() ) ).toBe( 'completed' );
      expect( process.exitCode ).toBeUndefined();
    } );

    it( 'returns a failed status and records exit 1 without throwing', async () => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory.mockResolvedValueOnce( history( 'failed' ) );

      // Not thrown: the caller's own output stays the command's primary result.
      expect( await streamWorkflowUpdates( options(), createIo() ) ).toBe( 'failed' );
      expect( process.exitCode ).toBe( 1 );
    } );

    it( 'returns undefined when the user detached, so no follow-up is printed', async () => {
      const { fetchWorkflowHistory } = await histories();
      const { sleep } = await import( '#utils/sleep.js' );
      fetchWorkflowHistory.mockResolvedValue( history( 'running' ) );

      const onSpy = vi.spyOn( process, 'on' );
      const exitSpy = vi.spyOn( process, 'exit' ).mockImplementation( ( () => undefined ) as any );
      vi.mocked( sleep ).mockImplementation( async () => {
        ( onSpy.mock.calls.find( ( [ event ] ) => event === 'SIGINT' )![1] as () => void )();
      } );

      expect( await streamWorkflowUpdates( options(), createIo() ) ).toBeUndefined();

      await flush();
      onSpy.mockRestore();
      exitSpy.mockRestore();
    } );
  } );

  describe( 'retry pacing', () => {
    it( 'caps the retry sleep while no cursor is established, ignoring a long --interval', async () => {
      const { fetchWorkflowHistory } = await histories();
      const { sleep } = await import( '#utils/sleep.js' );
      fetchWorkflowHistory
        .mockRejectedValueOnce( new HttpError( 'Service unavailable', { status: 503 } ) )
        .mockResolvedValueOnce( history( 'completed' ) );

      await streamWorkflowUpdates( options( { interval: 5000 } ), createIo() );

      // Otherwise "the API is down" takes interval x budget to surface — minutes,
      // for a `workflow monitor` against a server that was never reachable.
      expect( vi.mocked( sleep ) ).toHaveBeenCalledWith( 1000 );
    } );

    it( 'honors an --interval shorter than the cap rather than slowing the retry down', async () => {
      const { fetchWorkflowHistory } = await histories();
      const { sleep } = await import( '#utils/sleep.js' );
      fetchWorkflowHistory
        .mockRejectedValueOnce( new HttpError( 'Service unavailable', { status: 503 } ) )
        .mockResolvedValueOnce( history( 'completed' ) );

      await streamWorkflowUpdates( options( { interval: 250 } ), createIo() );

      expect( vi.mocked( sleep ) ).toHaveBeenCalledWith( 250 );
    } );

    it( 'sleeps the full --interval on a retry once a cursor exists', async () => {
      const { fetchWorkflowHistory, fetchWorkflowHistoryUpdates } = await histories();
      const { sleep } = await import( '#utils/sleep.js' );
      fetchWorkflowHistory.mockResolvedValueOnce( history( 'running' ) );
      fetchWorkflowHistoryUpdates
        .mockRejectedValueOnce( new HttpError( 'Service unavailable', { status: 503 } ) )
        .mockResolvedValueOnce( update( 'completed' ) );

      await streamWorkflowUpdates( options( { interval: 5000 } ), createIo() );

      expect( vi.mocked( sleep ) ).not.toHaveBeenCalledWith( 1000 );
      expect( vi.mocked( sleep ) ).toHaveBeenCalledWith( 5000 );
    } );
  } );

  describe( 'transient error classification', () => {
    const retried = async ( error: unknown ) => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory.mockRejectedValueOnce( error ).mockResolvedValueOnce( history( 'completed' ) );

      const io = createIo();
      await streamWorkflowUpdates( options(), io );

      return { calls: fetchWorkflowHistory.mock.calls.length, io };
    };

    it.each( [
      [ 'a 503', new HttpError( 'Service unavailable', { status: 503 } ) ],
      [ 'a 429 rate limit', new HttpError( 'Too many requests', { status: 429 } ) ],
      [ 'a 408 request timeout', new HttpError( 'Request timeout', { status: 408 } ) ],
      [ 'a client-side TimeoutError', Object.assign( new Error( 'timed out' ), { name: 'TimeoutError' } ) ],
      [ 'a nested ECONNREFUSED cause', Object.assign( new Error( 'fetch failed' ), { cause: { code: 'ECONNREFUSED' } } ) ],
      [ 'a top-level EAI_AGAIN', Object.assign( new Error( 'dns' ), { code: 'EAI_AGAIN' } ) ]
    ] )( 'retries %s', async ( _label, error ) => {
      const { calls, io } = await retried( error );

      expect( calls ).toBe( 2 );
      expect( io.warn ).toHaveBeenCalledWith( expect.stringContaining( '(1/5)' ) );
    } );

    it.each( [
      [ 'a 404 for a mistyped workflow id', new HttpError( 'Not found', { status: 404 } ) ],
      [ 'a 400 stale resume cursor', new HttpError( 'Invalid page token', { status: 400 } ) ],
      [ 'a bug in the parsing pipeline', new TypeError( 'spans is not iterable' ) ]
    ] )( 'surfaces %s immediately instead of burning the retry budget', async ( _label, error ) => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory.mockRejectedValue( error );

      const io = createIo();
      await expect( streamWorkflowUpdates( options(), io ) ).rejects.toThrow();

      expect( fetchWorkflowHistory ).toHaveBeenCalledTimes( 1 );
      expect( io.warn ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'detaching', () => {
    const detachDuring = async () => {
      const onSpy = vi.spyOn( process, 'on' );
      const exitSpy = vi.spyOn( process, 'exit' ).mockImplementation( ( () => undefined ) as any );
      const sigint = () => ( onSpy.mock.calls.find( ( [ event ] ) => event === 'SIGINT' )![1] as () => void )();
      return { onSpy, exitSpy, sigint };
    };

    it( 'swallows a poll failure raised after the user detached instead of racing the exit code', async () => {
      const { fetchWorkflowHistory } = await histories();
      const { onSpy, exitSpy, sigint } = await detachDuring();
      // The in-flight poll dies because the process is on its way out. Rethrowing
      // would unwind into `start`'s "monitoring stopped" handler and race exit 3
      // against the 130 the detach already recorded.
      fetchWorkflowHistory.mockImplementation( async () => {
        sigint();
        throw new Error( 'socket hang up' );
      } );

      const io = createIo();
      expect( await streamWorkflowUpdates( options(), io ) ).toBeUndefined();

      expect( process.exitCode ).toBe( 130 );
      expect( io.warn ).not.toHaveBeenCalled();
      expect( fetchWorkflowHistory ).toHaveBeenCalledTimes( 1 );

      await flush();
      onSpy.mockRestore();
      exitSpy.mockRestore();
    } );

    it( 'ignores a second Ctrl+C while the first is still draining stdout', async () => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory.mockResolvedValueOnce( history( 'completed' ) );
      const { onSpy, exitSpy, sigint } = await detachDuring();

      const io = createIo();
      await streamWorkflowUpdates( options(), io );

      sigint();
      // The exit is deferred behind a flush and the listener is still registered,
      // so an impatient user lands here again before the process is gone.
      sigint();
      await flush();

      const detached = io.log.mock.calls.filter( ( call: any[] ) => String( call[0] ).includes( 'Detached' ) );
      expect( detached ).toHaveLength( 1 );
      expect( exitSpy ).toHaveBeenCalledTimes( 1 );

      onSpy.mockRestore();
      exitSpy.mockRestore();
    } );

    it( 'removes its SIGINT listener once the loop ends', async () => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory.mockResolvedValueOnce( history( 'completed' ) );

      const before = process.listenerCount( 'SIGINT' );
      await streamWorkflowUpdates( options(), createIo() );

      expect( process.listenerCount( 'SIGINT' ) ).toBe( before );
    } );

    it( 'removes its SIGINT listener even when the loop unwinds on an error', async () => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory.mockRejectedValue( new HttpError( 'Not found', { status: 404 } ) );

      const before = process.listenerCount( 'SIGINT' );
      await expect( streamWorkflowUpdates( options(), createIo() ) ).rejects.toThrow();

      expect( process.listenerCount( 'SIGINT' ) ).toBe( before );
    } );
  } );

  describe( 'continue-as-new', () => {
    it( 'breaks instead of re-polling forever when the new run id is missing and io.error returns', async () => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory.mockResolvedValue( history( 'continued_as_new' ) );

      // `io.error` is typed `never`, but an io whose error returns would otherwise
      // fall through and replay the whole history every interval, forever, with a
      // zero exit code.
      const io = createIo( true );
      expect( await streamWorkflowUpdates( options(), io ) ).toBeUndefined();

      expect( io.error ).toHaveBeenCalledWith( expect.stringContaining( 'new run ID could not be determined' ) );
      expect( fetchWorkflowHistory ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'reports the chained run under the new run id in json mode', async () => {
      const { fetchWorkflowHistory } = await histories();
      fetchWorkflowHistory
        .mockResolvedValueOnce( history( 'continued_as_new', { continuedAsNewRunId: 'run-2' } ) )
        .mockResolvedValueOnce( history( 'completed', { runId: 'run-2' } ) );

      const io = createIo();
      await streamWorkflowUpdates( options( { json: true } ), io );

      const lines = io.log.mock.calls.map( ( call: any[] ) => JSON.parse( call[0] ) );
      expect( lines.some( ( line: any ) => line.continuedAsNewRunId === 'run-2' ) ).toBe( true );
      // Every subsequent line carries the run actually being polled, not the one
      // the stream attached to.
      expect( lines.at( -1 ) ).toMatchObject( { workflowId: 'wf-1', runId: 'run-2', status: 'completed' } );
    } );
  } );

  describe( 'commandStreamIo()', () => {
    it( 'resolves log/warn at call time so a replaced command method still receives output', async () => {
      const command = { log: vi.fn(), warn: vi.fn(), error: vi.fn() as any };
      const io = commandStreamIo( command );

      // oclif (and the command specs) swap these in as own properties after the
      // adapter exists, which a `.bind()` at construction time would miss.
      const replacement = vi.fn();
      command.log = replacement;
      io.log( 'hello' );

      expect( replacement ).toHaveBeenCalledWith( 'hello' );
    } );

    it( 'raises command errors with an explicit exit 1', () => {
      const command = { log: vi.fn(), warn: vi.fn(), error: vi.fn() as any };

      commandStreamIo( command ).error( 'boom' );

      expect( command.error ).toHaveBeenCalledWith( 'boom', { exit: 1 } );
    } );
  } );

  describe( 'monitorErrorOverrides()', () => {
    const withResponse = ( status: number, data?: unknown ) =>
      Object.assign( new Error( 'failed' ), { response: { status, data } } );

    it( 'overrides a 400 the server identifies as a stale resume cursor', () => {
      expect( monitorErrorOverrides( withResponse( 400, { error: 'InvalidPageTokenError' } ) ) ).toEqual( {
        400: expect.stringContaining( 'Resume cursor is no longer valid' )
      } );
    } );

    it( 'leaves an unrelated 400 alone rather than misdiagnosing it as a stale cursor', () => {
      // 400 also covers a missing runId and an out-of-range longPollTimeoutMs, whose
      // real validation messages are more useful than a cursor guess.
      expect( monitorErrorOverrides( withResponse( 400, { error: 'ValidationError' } ) ) ).toEqual( {} );
      expect( monitorErrorOverrides( withResponse( 400 ) ) ).toEqual( {} );
    } );

    it( 'does not override a 404, which only reads correctly where the user typed the id', () => {
      // `workflow monitor` adds its own; under `start --monitor` the id came back
      // from the API, so "check the workflow ID" would misdirect the user.
      expect( monitorErrorOverrides( withResponse( 404 ) ) ).toEqual( {} );
    } );

    it( 'tolerates an error with no response at all', () => {
      expect( monitorErrorOverrides( new Error( 'fetch failed' ) ) ).toEqual( {} );
    } );
  } );
} );
