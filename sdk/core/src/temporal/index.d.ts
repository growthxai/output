/**
 * Step-side access to the Temporal layer.
 *
 * These helpers are for **steps and evaluators** (Temporal Activities) that need to
 * interact with workflows directly — the primary use case is streaming incremental
 * results back to the invoking workflow via signals (e.g. LLM token batches consumed
 * by a workflow update handler).
 *
 * > [!WARNING]
 * > Node-runtime only. Never import this module from `workflow.ts` — workflows run in
 * > Temporal's isolated sandbox and cannot hold connections. Importing it there will
 * > fail the workflow bundle.
 *
 * @packageDocumentation
 */
export { getWorkflowClient, signalInvokingWorkflow } from './workflow_client.js';
