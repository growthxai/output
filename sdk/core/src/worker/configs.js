import * as z from 'zod';
import { isStringboolTrue } from '#helpers/string';
import { workerTunerEnvSchema } from './configs_tuner_schema.js';

class InvalidEnvVarsErrors extends Error { }

const coalesceEmptyString = v => v === '' ? undefined : v;

const durationSchema = z.preprocess(
  coalesceEmptyString,
  z.string()
    .regex( /^\d+$|^\d+(\.\d+)?\s?(ms|s|m|h|d)$/i )
    .optional()
);

const envVarSchema = z.object( {
  OUTPUT_CATALOG_ID: z.string().regex( /^[a-z0-9_.@-]+$/i ),
  OUTPUT_WORKER_TELEMETRY_INTERVAL_MS: z.preprocess( coalesceEmptyString, z.coerce.number().int().nonnegative().default( 0 ) ),
  TEMPORAL_ADDRESS: z.string().default( 'localhost:7233' ),
  TEMPORAL_API_KEY: z.string().optional(),
  TEMPORAL_NAMESPACE: z.string().optional().default( 'default' ),
  // Worker concurrency — tune these via env vars to adjust for your workload.
  // Each step (API, LLM, etc.) call is one activity. Lower this to reduce memory pressure.
  TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 40 ) ),
  /*
  Workflow tasks that may run at once. These are short state transitions, so this is rarely the
  throughput limit - activity concurrency above is. Left unset so @temporalio/worker applies its
  own default of 40; the startup 'Worker isolates' log reports it as workflowTaskSlots.
  https://typescript.temporal.io/api/interfaces/worker.WorkerOptions#maxconcurrentworkflowtaskexecutions
  */
  TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().optional() ),
  /*
  LRU cache for sticky workflow execution, holding each workflow's state until it completes or is
  evicted. Left unset so @temporalio/worker sizes it from the isolate's heap limit, which a flat
  value here cannot track. That formula assumes roughly 600 cached workflows per GB, so set this
  where payloads are heavier - the startup 'Worker isolates' log reports what it resolved to.
  https://typescript.temporal.io/api/interfaces/worker.WorkerOptions#maxcachedworkflows
  */
  TEMPORAL_MAX_CACHED_WORKFLOWS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().optional() ),
  // How aggressively the worker pulls tasks from Temporal.
  TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_POLLS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 5 ) ),
  TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_POLLS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 5 ) ),
  /*
  Threads running workflow sandboxes. Each is a V8 isolate and NODE_OPTIONS heap caps apply per
  isolate, so this multiplies the heap the process can commit - the startup 'Worker isolates'
  log reports the total. Left unset so @temporalio/worker picks: 1 with reuseV8Context, 2 without.
  https://typescript.temporal.io/api/interfaces/worker.WorkerOptions#workflowthreadpoolsize
  */
  TEMPORAL_WORKFLOW_THREAD_POOL_SIZE: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().optional() ),
  // JSON-encoded Temporal Worker tuner options.
  TEMPORAL_WORKER_TUNER: workerTunerEnvSchema,
  // Activity configs
  // How often the worker sends a heartbeat to the Temporal Service during activity execution
  OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 2 * 60 * 1000 ) ), // 2min
  // Whether to send activity heartbeats (enabled by default)
  OUTPUT_ACTIVITY_HEARTBEAT_ENABLED: z.transform( v => v === undefined ? true : isStringboolTrue( v ) ),
  // Set temporal worker shutdown force time. Defaults budget a shutdown against the 30s most
  // platforms allow before SIGKILL: force time + OUTPUT_HOOK_FLUSH_TIMEOUT_MS + 5s of margin.
  TEMPORAL_SHUTDOWN_FORCE_TIME: durationSchema.default( '20s' ),
  // Set temporal worker shutdown grace time, when in-flight activities are asked to cancel
  TEMPORAL_SHUTDOWN_GRACE_TIME: durationSchema.default( '15s' ),
  // How long the worker awaits pending hook callbacks once the drain is over, before exiting anyway
  OUTPUT_HOOK_FLUSH_TIMEOUT_MS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 5 * 1000 ) ), // 5s
  // HTTP CONNECT proxy for Temporal gRPC connections (e.g. "proxy-host:8080").
  // Must be a bare host:port — no scheme (Temporal's native HTTP CONNECT
  // option is not a URL).
  TEMPORAL_GRPC_PROXY: z.string().optional().refine(
    v => !v || !v.includes( '://' ),
    'TEMPORAL_GRPC_PROXY must be host:port without a scheme (e.g. "proxy:8080", not "http://proxy:8080")'
  )
} );

const { data: envVars, error } = envVarSchema.safeParse( process.env );
if ( error ) {
  throw new InvalidEnvVarsErrors( z.prettifyError( error ) );
}

export const address = envVars.TEMPORAL_ADDRESS;
export const apiKey = envVars.TEMPORAL_API_KEY;
export const maxConcurrentActivityTaskExecutions = envVars.TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS;
export const maxConcurrentWorkflowTaskExecutions = envVars.TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS;
export const maxCachedWorkflows = envVars.TEMPORAL_MAX_CACHED_WORKFLOWS;
export const maxConcurrentActivityTaskPolls = envVars.TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_POLLS;
export const maxConcurrentWorkflowTaskPolls = envVars.TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_POLLS;
export const workflowThreadPoolSize = envVars.TEMPORAL_WORKFLOW_THREAD_POOL_SIZE;
export const workerTuner = envVars.TEMPORAL_WORKER_TUNER;
export const namespace = envVars.TEMPORAL_NAMESPACE;
export const taskQueue = envVars.OUTPUT_CATALOG_ID;
export const catalogId = envVars.OUTPUT_CATALOG_ID;
export const workerTelemetryIntervalMs = envVars.OUTPUT_WORKER_TELEMETRY_INTERVAL_MS;
export const activityHeartbeatIntervalMs = envVars.OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS;
export const activityHeartbeatEnabled = envVars.OUTPUT_ACTIVITY_HEARTBEAT_ENABLED;
export const shutdownForceTime = envVars.TEMPORAL_SHUTDOWN_FORCE_TIME;
export const shutdownGraceTime = envVars.TEMPORAL_SHUTDOWN_GRACE_TIME;
export const hookFlushTimeoutMs = envVars.OUTPUT_HOOK_FLUSH_TIMEOUT_MS;
export const grpcProxy = envVars.TEMPORAL_GRPC_PROXY;
