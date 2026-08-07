import type { Client, WorkflowHandle } from '@temporalio/client';

/**
 * Worker-side access to the Temporal layer.
 *
 * `createTemporalClient()` is available after the worker establishes its Temporal
 * connection. `getCurrentWorkflowHandle()` is only available from Temporal Activities.
 *
 * > [!WARNING]
 * > These are not Temporal sandbox safe, do not import in workflows directly.
 * > These require the worker runtime, so in unit tests, mock the functions.
 *
 * @packageDocumentation
 */

/**
 * Creates a Temporal [Client](https://typescript.temporal.io/api/classes/client.Client)
 * instance with the same connection and namespace as the worker.
 *
 * @remarks
 * - Only available after the worker establishes its Temporal connection.
 */
export declare const createTemporalClient: () => Client;

/**
 * Return the [WorkflowHandle](https://typescript.temporal.io/api/interfaces/client.WorkflowHandle)
 * for the current workflow execution.
 *
 * @remarks
 * - Only available from a Temporal Activity running in the worker.
 */
export declare const getCurrentWorkflowHandle: () => WorkflowHandle;
