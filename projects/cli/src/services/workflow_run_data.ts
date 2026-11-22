import { defaultPayloadConverter, type Client, type Payload } from '@temporalio/client';
import { callTemporal } from '#services/temporal_client.js';

export interface WorkflowRunDataOptions {
  /** The workflow type the run must have */
  workflowName: string;
  workflowId: string;
  /** Defaults to the latest run of the workflow id */
  runId?: string;
}

export interface WorkflowRunData {
  workflowId: string;
  runId: string;
  /** The run whose start input was read: the first run of the chain when `runId` continued as new from earlier runs */
  inputRunId: string;
  input: Record<string, unknown>;
  /** `null` when the workflow returned nothing */
  output: unknown;
}

const isRecord = ( value: unknown ): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray( value );

const formatStatus = ( name: string ): string => name.toLowerCase().replaceAll( '_', ' ' );

const formatRunLabel = ( workflowId: string, runId: string ): string => `Workflow ${workflowId} (run ${runId})`;

interface StartedAttributes {
  firstExecutionRunId?: string | null;
  input?: { payloads?: unknown[] | null } | null;
}

const fetchStartedAttributes = async ( client: Client, workflowId: string, runId: string ): Promise<StartedAttributes> => {
  const response = await callTemporal( client, () => client.connection.workflowService.getWorkflowExecutionHistory( {
    namespace: client.options.namespace,
    execution: { workflowId, runId },
    maximumPageSize: 1
  } ) );
  const started = response.history?.events?.[0]?.workflowExecutionStartedEventAttributes;
  if ( !started ) {
    throw new Error( `${formatRunLabel( workflowId, runId )} has no start event in its history.` );
  }
  return started;
};

const decodeInput = ( started: StartedAttributes ): unknown => {
  const payload = started.input?.payloads?.[0];
  // No payload, or a payload that encodes "nothing", means the workflow started without input
  const input = payload ? defaultPayloadConverter.fromPayload( payload as Payload ) : undefined;
  return input === undefined ? {} : input;
};

/**
 * Reads the input the workflow was started with. A run that continued as new from earlier runs holds the continuation
 * arguments as its own input, so the input of the first run of the chain is read instead.
 */
const fetchRunInput = async ( client: Client, workflowId: string, runId: string ): Promise<{ input: unknown; inputRunId: string }> => {
  const started = await fetchStartedAttributes( client, workflowId, runId );
  const firstRunId = started.firstExecutionRunId;
  if ( !firstRunId || firstRunId === runId ) {
    return { input: decodeInput( started ), inputRunId: runId };
  }

  const first = await fetchStartedAttributes( client, workflowId, firstRunId ).catch( ( error: unknown ) => {
    const reason = error instanceof Error ? error.message : String( error );
    const label = formatRunLabel( workflowId, runId );
    throw new Error( `${label} continued from run ${firstRunId}, which could not be read, so its original input is unknown. ${reason}` );
  } );
  return { input: decodeInput( first ), inputRunId: firstRunId };
};

/**
 * Reads the start input and the result of a completed workflow run from Temporal, to turn it into a dataset case.
 * Nothing is truncated. A run that is missing, of another workflow type or not completed is an error.
 *
 * @param client - The Temporal client
 * @param options - The run to read
 * @returns The run's ids, the run its input was read from, its input (an object) and its output
 */
export async function collectWorkflowRunData(
  client: Client,
  { workflowName, workflowId, runId }: WorkflowRunDataOptions
): Promise<WorkflowRunData> {
  const description = await callTemporal( client, () => client.workflow.getHandle( workflowId, runId ).describe() );
  const label = formatRunLabel( workflowId, description.runId );

  if ( description.type !== workflowName ) {
    const hint = `Use "${description.type}" as the workflow name; aliases are not accepted.`;
    throw new Error( `${label} is a "${description.type}" workflow, not "${workflowName}". ${hint}` );
  }

  if ( description.status.name !== 'COMPLETED' ) {
    const hint = description.status.name === 'CONTINUED_AS_NEW' ? ' Omit the run id or pass the run id of the last run.' : '';
    throw new Error( `${label} is ${formatStatus( description.status.name )}. Only completed runs can be turned into a dataset case.${hint}` );
  }

  const { input, inputRunId } = await fetchRunInput( client, workflowId, description.runId );
  if ( !isRecord( input ) ) {
    throw new Error( `${formatRunLabel( workflowId, inputRunId )} has an input that is not an object. A dataset case needs an object input.` );
  }

  const output = await callTemporal( client, () => client.workflow.getHandle( workflowId, description.runId ).result() );

  // A workflow that returns nothing has an undefined result; a case keeps it as null so it still counts as cached output
  return { workflowId, runId: description.runId, inputRunId, input, output: output ?? null };
}
