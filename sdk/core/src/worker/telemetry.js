import { getHeapStatistics } from 'node:v8';
import { serializeError } from '#helpers/error_serializer';
import { createChildLogger } from '#logger';
import { workerTelemetryIntervalMs } from './configs.js';

const log = createChildLogger( 'Telemetry' );

/**
 * Log how the worker is sized against the container it booted in, and
 * warn when either the heap or the workflow cache looks unsafe.
 *
 * The worker runs one isolate on the main thread and one more per
 * workflow thread. A NODE_OPTIONS heap cap applies to each isolate
 * separately rather than to the process as a whole, so on a 4 GB box
 * `--max-old-space-size-percentage=85` allows every isolate ~3.4 GB:
 * two of them may commit well past what the container holds.
 *
 * The cache and the task slots are sized independently:
 * `@temporalio/worker` derives `maxCachedWorkflows` from the heap limit
 * but fixes `workflowTaskSlots` at 40. A small container can run more
 * its cache can hold, and the excess evict each other's workflows,
 * leaving the worker to replay history to recover.
 *
 * Logged fields, read from `worker.options` so each is the resolved
 * value rather than the one requested:
 *
 * - `workflowThreadPoolSize`: threads running workflow sandboxes. 1 with
 *   `reuseV8Context`, 2 without, and ignored under `debugMode`.
 * - `reuseV8Context`: whether workflows share one VM context per thread
 *   or each get a fresh one. Sharing is the default and fits roughly 600
 *   cached workflows per GB against 250 without it.
 * - `isolateCount`: `1 + workflowThreadPoolSize`, the multiplier on
 *   every per-isolate heap cap.
 * - `heapSizeLimit`: this isolate's V8 ceiling, i.e. what NODE_OPTIONS
 *   actually produced rather than what it was meant to.
 * - `projectedCommittedHeap`: `isolateCount * heapSizeLimit`, the heap
 *   the process may commit with every isolate full. A projection: only
 *   this thread's limit is readable, so it assumes the workflow threads
 *   took the same one.
 * - `constrainedMemory`: the container limit to compare against, or 0
 *   when unconstrained, which is why the warning is guarded on it.
 * - `maxCachedWorkflows`: how many workflows stay sticky. Normally left
 *   unset, so this is the size derived from `heapSizeLimit`.
 * - `workflowTaskSlots`: how many workflow tasks may run at once, taken
 *   from the tuner. Undefined when a resource-based tuner decides at
 *   runtime instead of holding a fixed count.
 *
 * @param {object} params Parameters.
 * @param {import('@temporalio/worker').Worker} params.worker The created Temporal worker.
 */
export const logIsolateSizing = ( { worker } ) => {
  const { workflowThreadPoolSize, reuseV8Context, maxCachedWorkflows, tuner } = worker.options;
  const isolateCount = 1 + workflowThreadPoolSize;
  const heapSizeLimit = getHeapStatistics().heap_size_limit;
  const constrainedMemory = process.constrainedMemory();
  const workflowTaskSlots = tuner?.workflowTaskSlotSupplier?.numSlots;
  const info = {
    workflowThreadPoolSize,
    reuseV8Context,
    isolateCount,
    heapSizeLimit,
    projectedCommittedHeap: isolateCount * heapSizeLimit,
    constrainedMemory,
    maxCachedWorkflows,
    workflowTaskSlots
  };

  if ( constrainedMemory && info.projectedCommittedHeap > constrainedMemory ) {
    log.warn( 'Worker isolates may commit more heap than the container allows', info );
    return;
  }

  if ( workflowTaskSlots > maxCachedWorkflows ) {
    log.warn( 'Worker runs more workflow tasks than it can cache, forcing replays', info );
    return;
  }

  log.info( 'Worker isolates', info );
};

/**
 * Start the interval that logs worker status and memory, unless
 * OUTPUT_WORKER_TELEMETRY_INTERVAL_MS leaves it off.
 *
 * Every record pairs the Temporal worker's `status` with a `memory`
 * block. Those figures mix two scopes, which is the thing to keep
 * straight when reading them:
 *
 * - `availableMemory`: free memory the process may still take,
 *   honouring the container limit.
 * - `constrainedMemory`: that limit, or 0 when unconstrained.
 * - `memoryUsage`: raw `process.memoryUsage()`. `rss` is process-wide,
 *   while `heapTotal` and `heapUsed` cover only the isolate that asked,
 *   which is the main thread.
 * - `nonMainHeap`: `memoryUsage.rss - memoryUsage.heapUsed`, so
 *   everything resident that is not the main isolate's live objects:
 *   workflow thread heaps, the Rust core's allocations, buffers, and
 *   pages V8 committed but has not filled. It bounds the workflow thread
 *   heap rather than measuring it. Cached workflows show up here - RSS
 *   climbs with the cache while `heapUsed` stays flat.
 * - `heapSizeLimit`: the main isolate's V8 ceiling. Static, but on
 *   every sample so one record carries its own ceiling.
 *
 * @param {object} params Parameters.
 * @param {import('@temporalio/worker').Worker} params.worker The created Temporal worker.
 */
export const setupTelemetry = ( { worker } ) => {
  if ( workerTelemetryIntervalMs <= 0 ) {
    return;
  }
  setInterval( () => {
    try {
      const memoryUsage = process.memoryUsage();
      log.info( 'Worker', {
        status: worker.getStatus(),
        memory: {
          availableMemory: process.availableMemory(),
          constrainedMemory: process.constrainedMemory(),
          memoryUsage,
          nonMainHeap: memoryUsage.rss - memoryUsage.heapUsed,
          heapSizeLimit: getHeapStatistics().heap_size_limit
        }
      } );
    } catch ( error ) {
      log.warn( 'Failure', { error: serializeError( error, { dropKeys: [ 'stack' ] } ) } );
    }
  }, workerTelemetryIntervalMs ).unref();
};
