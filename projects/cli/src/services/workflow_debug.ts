import { WorkflowNotFoundError, type Client } from '@temporalio/client';
import { defaultPayloadConverter } from '@temporalio/common';
import { historyToJSON, JSONToPayload, type JSONPayload } from '@temporalio/common/lib/proto-utils.js';
import { truncateStack, truncateValue } from '#utils/payload_truncator.js';

const PAGE_SIZE = 1000;
const DEFAULT_PAGE_BUDGET = 1000;
const DEFAULT_EVENT_BUDGET = 100_000;
const DEFAULT_CONCURRENCY = 5;
const GRPC_NOT_FOUND = 5;
const GRPC_DEADLINE_EXCEEDED = 4;
const CALL_TIMEOUT_MS = 30_000;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DebugOptions {
  /** Pages (of 1,000 events) that may be read across the whole tree */
  pageBudget?: number;
  /** Events that may be kept across the whole tree; the last page read is cut to fit */
  eventBudget?: number;
  /** Histories fetched at once; speed only, the output order does not change */
  concurrency?: number;
}

/** One workflow in the output: its metadata first, its own history events last */
export interface WorkflowEntry {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: string | null;
  parent?: { workflowId: string; runId: string };
  pendingActivities: Json[];
  pendingChildren: Json[];
  events: Json[];
}

export interface WorkflowDebugResult {
  /** True when nothing is missing; exactly `warnings.length === 0` */
  complete: boolean;
  /** Plain sentences about what could not be read, for people and LLMs */
  warnings: string[];
  temporal: { address: string; namespace: string };
  /** The requested workflow first, then every child and every continued run, ordered by the time each was started */
  workflows: WorkflowEntry[];
}

interface Target {
  entry: WorkflowEntry;
  /** Server time at which the parent reported the child started, or the previous run continued; zero for the root */
  startKey: bigint;
  nextPageToken?: Uint8Array;
}

interface WorkflowMeta {
  runId: string;
  workflowType: string;
  status: string;
  pendingActivities: Json[];
  pendingChildren: Json[];
}

interface FetchedPage {
  events: Json[];
  nextPageToken?: Uint8Array;
}

type ReadOutcome = FetchedPage | { error: unknown };

const CLOSING_EVENT = /^EVENT_TYPE_WORKFLOW_EXECUTION_(COMPLETED|FAILED|TIMED_OUT|CANCELED|TERMINATED|CONTINUED_AS_NEW)$/;
const RUNNING_STATUS = 'WORKFLOW_EXECUTION_STATUS_RUNNING';

const isObject = ( value: unknown ): value is Json => value !== null && typeof value === 'object' && !Array.isArray( value );

const isPayload = ( value: unknown ): value is JSONPayload => {
  if ( !isObject( value ) || !Object.keys( value ).every( key => key === 'metadata' || key === 'data' ) ) {
    return false;
  }
  return isObject( value.metadata ) && typeof value.metadata.encoding === 'string';
};

const decodePayload = ( payload: JSONPayload ): unknown => {
  try {
    const decoded = defaultPayloadConverter.fromPayload( JSONToPayload( payload ) );
    return decoded instanceof Uint8Array ? `[Binary Payload: ${decoded.byteLength} bytes]` : decoded;
  } catch {
    const encoding = Buffer.from( payload.metadata?.encoding ?? '', 'base64' ).toString();
    return `[Undecodable Payload: ${encoding}]`;
  }
};

/**
 * Walks Temporal's JSON for an event (or any message) and replaces every payload with its decoded, truncated value.
 * Everything else keeps Temporal's own shape; only stack traces are cut to their first lines.
 *
 * @param node - Value from Temporal's JSON
 * @returns A copy with decoded payloads
 */
export const decodeNode = ( node: unknown ): unknown => {
  if ( isPayload( node ) ) {
    return truncateValue( decodePayload( node ) );
  }
  if ( Array.isArray( node ) ) {
    return node.map( decodeNode );
  }
  if ( !isObject( node ) ) {
    return node;
  }
  return Object.fromEntries( Object.entries( node ).map( ( [ key, value ] ) => [
    key,
    key === 'stackTrace' && typeof value === 'string' ? truncateStack( value ) : decodeNode( value )
  ] ) );
};

/**
 * Orders events by their parsed server time. Compares seconds and nanos, since ISO strings with
 * different fraction lengths do not sort as text.
 *
 * @param a - Timestamp key of the first event
 * @param b - Timestamp key of the second event
 * @returns Negative, zero or positive for sorting
 */
const compareByEventTime = ( a: bigint, b: bigint ): number => {
  if ( a === b ) {
    return 0;
  }
  return a < b ? -1 : 1;
};

const buildTimeKey = ( time: Json | undefined ): bigint => ( BigInt( String( time?.seconds ?? 0 ) ) * 1_000_000_000n ) + BigInt( time?.nanos ?? 0 );

/** Temporal responses are protobufjs messages; `toJSON` gives enum names and string ids */
const toJson = ( message: unknown ): Json => ( message as { toJSON?: () => Json } )?.toJSON?.() ?? {};

const isNotFound = ( error: unknown ): boolean => error instanceof WorkflowNotFoundError || ( error as { code?: number } )?.code === GRPC_NOT_FOUND;

/** Runs one Temporal call under a deadline, so an unresponsive server cannot hang the command */
const callTemporal = async <T>( client: Client, call: () => Promise<T> ): Promise<T> => {
  try {
    return await client.connection.withDeadline( Date.now() + CALL_TIMEOUT_MS, call );
  } catch ( error ) {
    if ( ( error as { code?: number } )?.code === GRPC_DEADLINE_EXCEEDED ) {
      throw new Error( `Temporal did not answer within ${CALL_TIMEOUT_MS / 1000}s`, { cause: error } );
    }
    throw error;
  }
};

const fetchWorkflowMeta = async ( client: Client, workflowId: string, runId?: string ): Promise<WorkflowMeta> => {
  const description = await callTemporal( client, () => client.workflow.getHandle( workflowId, runId ).describe() );
  const info = toJson( description.raw.workflowExecutionInfo );

  return {
    runId: description.runId,
    workflowType: description.type,
    status: info.status,
    pendingActivities: ( description.raw.pendingActivities ?? [] ).map( activity => {
      const json = toJson( activity );
      return decodeNode( {
        activityId: json.activityId,
        activityType: json.activityType?.name,
        state: json.state,
        attempt: json.attempt,
        lastFailure: json.lastFailure
      } ) as Json;
    } ),
    pendingChildren: ( description.raw.pendingChildren ?? [] ).map( child => ( {
      workflowId: child.workflowId,
      runId: child.runId,
      workflowType: child.workflowTypeName
    } ) )
  };
};

const fetchPage = async ( client: Client, target: Target ): Promise<FetchedPage> => {
  const response = await callTemporal( client, () => client.connection.workflowService.getWorkflowExecutionHistory( {
    namespace: client.options.namespace,
    execution: { workflowId: target.entry.workflowId, runId: target.entry.runId },
    maximumPageSize: PAGE_SIZE,
    nextPageToken: target.nextPageToken
  } ) );
  const events = response.history?.events ?? [];
  const json = ( JSON.parse( historyToJSON( { events } ) ).events ?? [] ) as Json[];
  const tagged = json.map( ( event, i ) => Object.assign( event, { timeKey: buildTimeKey( events[i].eventTime as Json ) } ) );
  return { events: tagged, nextPageToken: response.nextPageToken?.length ? response.nextPageToken : undefined };
};

interface Ids {
  workflowId: string;
  runId: string;
}

const buildEntry = ( ids: Ids, workflowType: string, parent?: Ids ): WorkflowEntry => ( {
  workflowId: ids.workflowId,
  runId: ids.runId,
  workflowType,
  status: null,
  ...( parent ? { parent } : {} ),
  pendingActivities: [],
  pendingChildren: [],
  events: []
} );

const findChildren = ( events: Json[], parent: Target ): Target[] => events.flatMap( event => {
  const attributes = event.childWorkflowExecutionStartedEventAttributes;
  const execution = attributes?.workflowExecution;
  if ( !execution?.workflowId || !execution?.runId ) {
    return [];
  }
  const { workflowId, runId } = parent.entry;
  return [ {
    entry: buildEntry( execution, attributes.workflowType?.name ?? '', { workflowId, runId } ),
    startKey: event.timeKey
  } ];
} );

/**
 * When a run continues as new, the next run is read as its own entry (same workflow id, new run id, same parent, if any),
 * ordered by the time the previous run continued. A parent's events name only the first run of a child, so this is also
 * how the rest of a child's runs are found. Runs share the page and event budgets with everything else.
 */
const findContinuation = ( events: Json[], target: Target ): Target[] => events.flatMap( event => {
  const runId = event.workflowExecutionContinuedAsNewEventAttributes?.newExecutionRunId;
  if ( !runId ) {
    return [];
  }
  const { workflowId, workflowType, parent } = target.entry;
  return [ { entry: buildEntry( { workflowId, runId }, workflowType, parent ), startKey: event.timeKey } ];
} );

const formatWorkflowLabel = ( { parent }: WorkflowEntry ): string => ( parent ? 'Child workflow' : 'Workflow' );

const formatReason = ( error: unknown ): string => ( error instanceof Error ? error.message : String( error ) );

const formatWarning = {
  unavailable: ( entry: WorkflowEntry ) => [
    `${formatWorkflowLabel( entry )} ${entry.workflowId} (run ${entry.runId}) is no longer in Temporal:`,
    'closed histories are deleted after the namespace retention period. Its entry has no events.'
  ].join( ' ' ),
  notRead: ( entry: WorkflowEntry, limit: string ) => [
    `${formatWorkflowLabel( entry )} ${entry.workflowId} (run ${entry.runId}) was not read:`,
    `the limit of ${limit} for the whole tree was reached. Its entry has no events.`
  ].join( ' ' ),
  failed: ( entry: WorkflowEntry, error: unknown ) => {
    return [
      `${formatWorkflowLabel( entry )} ${entry.workflowId} (run ${entry.runId}) could not be read: ${formatReason( error )}.`,
      entry.events.length ? 'Its entry has the events read so far.' : 'Its entry has no events.'
    ].join( ' ' );
  },
  closedWhileReading: ( entry: WorkflowEntry ) => [
    `${formatWorkflowLabel( entry )} ${entry.workflowId} (run ${entry.runId}) finished while it was being read:`,
    'its events stop before the end. Run the command again.'
  ].join( ' ' ),
  noStatus: ( entry: WorkflowEntry, error: unknown ) => [
    `${formatWorkflowLabel( entry )} ${entry.workflowId} (run ${entry.runId}) could not be described: ${formatReason( error )}.`,
    'Its status and pending lists may be missing or out of date.'
  ].join( ' ' ),
  partial: ( entry: WorkflowEntry, limit: string ) => [
    `${formatWorkflowLabel( entry )} ${entry.workflowId} (run ${entry.runId}) was read only in part:`,
    `the limit of ${limit} for the whole tree was reached. Its entry has the events read so far.`
  ].join( ' ' )
};

/**
 * Reads one workflow run from Temporal, with every child it started and every run that continues from it.
 * The result has one entry per run.
 * Events keep Temporal's default JSON form with payloads decoded and truncated, and nothing added.
 * The status and pending lists are described after every history was read, so they are never older than the events.
 * Paging is breadth-first under one page budget and one event budget for the whole tree. A failure on the requested run's first page throws;
 * any other read failure becomes a warning and the entry keeps what was read.
 *
 * @param client - Temporal client
 * @param params - What to read and where it lives
 * @param params.address - Address the client uses, echoed in the result
 * @param params.namespace - Namespace the client uses, echoed in the result
 * @param params.workflowId - Workflow to read
 * @param params.runId - Run to start from; the latest run when omitted
 * @param options - Page budget, event budget and concurrency
 * @returns The workflow entries, plus `complete` and the warnings for anything that was left out
 */
export async function collectWorkflowDebug(
  client: Client,
  params: { address: string; namespace: string; workflowId: string; runId?: string },
  options: DebugOptions = {}
): Promise<WorkflowDebugResult> {
  const { pageBudget = DEFAULT_PAGE_BUDGET, eventBudget = DEFAULT_EVENT_BUDGET, concurrency = DEFAULT_CONCURRENCY } = options;
  const { runId: rootRunId, ...rootMeta } = await fetchWorkflowMeta( client, params.workflowId, params.runId );

  const root: Target = {
    entry: Object.assign( buildEntry( { workflowId: params.workflowId, runId: rootRunId }, rootMeta.workflowType ), rootMeta ),
    startKey: 0n
  };
  const unstarted: Target[] = [ root ];
  const inProgress: Target[] = [];
  const children: Target[] = [];
  const seen = new Set( [ `${params.workflowId}/${rootRunId}` ] );
  const warnings: string[] = [];
  const progress = { pagesRead: 0, eventsRead: 0 };

  const failed = new Set<Target>();

  const readPage = async ( target: Target ): Promise<ReadOutcome> => fetchPage( client, target ).catch( ( error: unknown ) => ( { error } ) );

  while ( ( unstarted.length || inProgress.length ) && progress.pagesRead < pageBudget && progress.eventsRead < eventBudget ) {
    const room = Math.min( concurrency, pageBudget - progress.pagesRead );
    // Every child gets its first page before any history gets a second one
    const first = unstarted.splice( 0, room );
    const next = inProgress.splice( 0, room - first.length );
    progress.pagesRead += first.length + next.length;

    const results = await Promise.all( [ ...first, ...next ].map( readPage ) );

    [ ...first, ...next ].forEach( ( target, i ) => {
      const result = results[i];
      if ( 'error' in result ) {
        // Nothing can be shown without the first page of the requested run
        if ( target === root && !target.nextPageToken ) {
          throw result.error;
        }
        failed.add( target );
        const isGone = isNotFound( result.error ) && !target.entry.events.length;
        warnings.push( isGone ? formatWarning.unavailable( target.entry ) : formatWarning.failed( target.entry, result.error ) );
        return;
      }
      // The last page read is cut to what is left of the event budget
      const kept = result.events.slice( 0, eventBudget - progress.eventsRead );
      const isCut = kept.length < result.events.length;
      progress.eventsRead += kept.length;
      target.entry.events.push( ...kept.map( ( { timeKey, ...event } ) => decodeNode( event ) as Json ) );

      const discovered = [ ...findChildren( kept, target ), ...findContinuation( kept, target ) ];
      for ( const child of discovered ) {
        const key = `${child.entry.workflowId}/${child.entry.runId}`;
        if ( !seen.has( key ) ) {
          seen.add( key );
          unstarted.push( child );
          children.push( child );
        }
      }
      if ( isCut && !target.entry.events.length ) {
        unstarted.push( target );
      } else if ( isCut || result.nextPageToken ) {
        inProgress.push( Object.assign( target, { nextPageToken: result.nextPageToken } ) );
      }
    } );
  }

  const unfinished = new Set<Target>( [ ...failed, ...inProgress ] );
  const limit = progress.eventsRead >= eventBudget ? `${eventBudget} events` : `${pageBudget} pages`;
  warnings.push(
    ...unstarted.map( target => formatWarning.notRead( target.entry, limit ) ),
    ...inProgress.map( target => formatWarning.partial( target.entry, limit ) )
  );

  // The description is read after the events, so it is never older than they are
  const refresh = async ( target: Target ): Promise<string | undefined> => {
    try {
      const meta = await fetchWorkflowMeta( client, target.entry.workflowId, target.entry.runId );
      Object.assign( target.entry, meta );
      const isClosed = Boolean( meta.status ) && meta.status !== RUNNING_STATUS;
      const isMissingEnd = !unfinished.has( target ) && !target.entry.events.some( event => CLOSING_EVENT.test( event.eventType ) );
      return isClosed && isMissingEnd ? formatWarning.closedWhileReading( target.entry ) : undefined;
    } catch ( error ) {
      return formatWarning.noStatus( target.entry, error );
    }
  };
  const described = [ root, ...children ].filter( target => target.entry.events.length );
  const batches = Array.from(
    { length: Math.ceil( described.length / concurrency ) },
    ( _, i ) => described.slice( i * concurrency, ( i + 1 ) * concurrency )
  );
  for ( const batch of batches ) {
    warnings.push( ...( await Promise.all( batch.map( refresh ) ) ).filter( ( warning ): warning is string => Boolean( warning ) ) );
  }

  // Array.prototype.sort is stable: children reported at the same time keep their discovery order
  const ordered = children.sort( ( a, b ) => compareByEventTime( a.startKey, b.startKey ) );
  return {
    complete: warnings.length === 0,
    warnings,
    temporal: { address: params.address, namespace: params.namespace },
    workflows: [ root.entry, ...ordered.map( target => target.entry ) ]
  };
}
