import * as z from 'zod';
import { isStringboolTrue } from '#utils';

class InvalidEnvVarsErrors extends Error { }

const coalesceEmptyString = v => v === '' ? undefined : v;

const envVarSchema = z.object( {
  OUTPUT_CATALOG_ID: z.string().regex( /^[a-z0-9_.@-]+$/i ),
  TEMPORAL_ADDRESS: z.string().default( 'localhost:7233' ),
  TEMPORAL_API_KEY: z.string().optional(),
  TEMPORAL_NAMESPACE: z.string().optional().default( 'default' ),
  // Worker concurrency — tune these via env vars to adjust for your workload.
  // Each step (API, LLM, etc.) call is one activity. Lower this to reduce memory pressure.
  TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 40 ) ),
  // Workflows are lightweight state machines — this can be high.
  TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 200 ) ),
  // LRU cache for sticky workflow execution. Lower values free memory faster after surges.
  TEMPORAL_MAX_CACHED_WORKFLOWS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 1000 ) ),
  // How aggressively the worker pulls tasks from Temporal.
  TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_POLLS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 5 ) ),
  TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_POLLS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 5 ) ),
  // Activity configs
  // How often the worker sends a heartbeat to the Temporal Service during activity execution
  OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 2 * 60 * 1000 ) ), // 2min
  // Whether to send activity heartbeats (enabled by default)
  OUTPUT_ACTIVITY_HEARTBEAT_ENABLED: z.transform( v => v === undefined ? true : isStringboolTrue( v ) ),
  // Time to allow for hooks to flush before shutdown
  OUTPUT_PROCESS_FAILURE_SHUTDOWN_DELAY: z.preprocess( coalesceEmptyString, z.coerce.number().int().positive().default( 3000 ) ),
  // HTTP CONNECT proxy for Temporal gRPC connections (e.g. "proxy-host:8080")
  TEMPORAL_GRPC_PROXY: z.string().optional()
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
export const namespace = envVars.TEMPORAL_NAMESPACE;
export const taskQueue = envVars.OUTPUT_CATALOG_ID;
export const catalogId = envVars.OUTPUT_CATALOG_ID;
export const activityHeartbeatIntervalMs = envVars.OUTPUT_ACTIVITY_HEARTBEAT_INTERVAL_MS;
export const activityHeartbeatEnabled = envVars.OUTPUT_ACTIVITY_HEARTBEAT_ENABLED;
export const processFailureShutdownDelay = envVars.OUTPUT_PROCESS_FAILURE_SHUTDOWN_DELAY;
export const grpcProxy = envVars.TEMPORAL_GRPC_PROXY;
