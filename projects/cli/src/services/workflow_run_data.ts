import { WorkflowNotFoundError, type Client } from '@temporalio/client';
import { defaultPayloadConverter, type Payload } from '@temporalio/common';
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
  input: Record<string, unknown>;
  /** `null` when the workflow returned nothing */
  output: unknown;
}

const isRecord = ( value: unknown ): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray( value );

const formatStatus = ( name: string ): string => name.toLowerCase().replaceAll( '_', ' ' );

const formatRunLabel = ( workflowId: string, runId: string ): string => `Workflow ${workflowId} (run ${runId})`;

const buildNotFoundMessage = ( error: WorkflowNotFoundError ): string => {
  return `${error.message.charAt( 0 ).toUpperCase()}${error.message.slice( 1 )}. Check the workflow id, the run id and the namespace.`;
};

const fetchRunInput = async ( client: Client, workflowId: string, runId: string ): Promise<unknown> => {
  const response = await callTemporal( client, () => client.connection.workflowService.getWorkflowExecutionHistory( {
    namespace: client.options.namespace,
    execution: { workflowId, runId },
    maximumPageSize: 1
  } ) );
  const payload = response.history?.events?.[0]?.workflowExecutionStartedEventAttributes?.input?.payloads?.[0];
  // No payload, or a payload that encodes "nothing", means the workflow started without input
  const input = payload ? defaultPayloadConverter.fromPayload( payload as Payload ) : undefined;
  return input === undefined ? {} : input;
};

/**
 * Reads the start input and the result of a completed workflow run from Temporal, to turn it into a dataset case.
 * Nothing is truncated. A run that is missing, of another workflow type or not completed is an error.
 *
 * @param client - The Temporal client
 * @param options - The run to read
 * @returns The run's ids, its input (an object) and its output
 */
export async function collectWorkflowRunData(
  client: Client,
  { workflowName, workflowId, runId }: WorkflowRunDataOptions
): Promise<WorkflowRunData> {
  const description = await callTemporal( client, () => client.workflow.getHandle( workflowId, runId ).describe() )
    .catch( ( error: unknown ) => {
      throw error instanceof WorkflowNotFoundError ? new Error( buildNotFoundMessage( error ) ) : error;
    } );
  const label = formatRunLabel( workflowId, description.runId );

  if ( description.type !== workflowName ) {
    throw new Error( `${label} is a "${description.type}" workflow, not "${workflowName}".` );
  }

  if ( description.status.name !== 'COMPLETED' ) {
    const hint = description.status.name === 'CONTINUED_AS_NEW' ? ' Pass the run id of the last run.' : '';
    throw new Error( `${label} is ${formatStatus( description.status.name )}. Only completed runs can be turned into a dataset case.${hint}` );
  }

  const input = await fetchRunInput( client, workflowId, description.runId );
  if ( !isRecord( input ) ) {
    throw new Error( `${label} has an input that is not an object. A dataset case needs an object input.` );
  }

  const output = await callTemporal( client, () => client.workflow.getHandle( workflowId, description.runId ).result() );

  // A workflow that returns nothing has an undefined result; a case keeps it as null so it still counts as cached output
  return { workflowId, runId: description.runId, input, output: output ?? null };
}
