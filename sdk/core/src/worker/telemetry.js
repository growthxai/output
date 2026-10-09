import { totalmem } from 'node:os';
import { getHeapStatistics } from 'node:v8';
import { serializeError } from '#helpers/error_serializer';
import { createChildLogger } from '#logger';
import { workerTelemetryIntervalMs } from './configs.js';

const log = createChildLogger( 'Telemetry' );

/**
 * Resolve the memory limit to compare the worker against: the container's limit, or the
 * machine's total memory when there is none.
 *
 * `process.constrainedMemory()` returns a sentinel near 2^64 rather than 0 when the process is
 * unconstrained, so values at or above the machine's memory are treated as no limit.
 *
 * @returns {number} Bytes.
 */
const resolveMemoryLimit = () => {
  const constrainedMemory = process.constrainedMemory();
  const machineMemory = totalmem();
  return constrainedMemory > 0 && constrainedMemory < machineMemory ? constrainedMemory : machineMemory;
};

/**
 * Log the worker's isolate and cache sizing. Warn when the projected
 * heap exceeds the memory limit, or when workflow task slots exceed
 * the cache.
 *
 * The worker runs one isolate on the main thread and one per workflow
 * thread. A NODE_OPTIONS heap cap applies to each isolate, not to the
 * process, so on a 4 GB container `--max-old-space-size-percentage=85`
 * allows each isolate ~3.4 GB and two isolates can commit well over
 * the container's memory.
 *
 * The cache and the task slots are sized independently:
 * `@temporalio/worker` derives `maxCachedWorkflows` from the heap limit
 * but fixes `workflowTaskSlots` at 40. On a small container the slots
 * can exceed the cache, which causes tasks to evict each other's
 * workflows and forces history replays.
 *
 * Logged fields are read from `worker.options`, so each is the resolved
 * value rather than the requested one:
 *
 * - `workflowThreadPoolSize`: threads running workflow sandboxes.
 *   Defaults to 1 with `reuseV8Context`, 2 without. Ignored under
 *   `debugMode`.
 * - `reuseV8Context`: whether workflows share one VM context per thread
 *   or each get a new one. Enabled by default. Upstream estimates
 *   roughly 600 cached workflows per GB with it and 250 without.
 * - `isolateCount`: `1 + workflowThreadPoolSize`, the multiplier on the
 *   per-isolate heap cap. 1 under `debugMode`, which runs workflows in
 *   the main isolate and spawns no workflow threads.
 * - `heapSizeLimit`: the main isolate's V8 heap ceiling, as resolved
 *   from NODE_OPTIONS.
 * - `projectedCommittedHeap`: `isolateCount * heapSizeLimit`, the heap
 *   the process can commit if every isolate fills. Only the main
 *   thread's limit is readable, so this assumes the workflow threads
 *   have the same one.
 * - `memoryLimit`: the limit the projection is compared against. The
 *   container's limit, or the machine's total memory when unconstrained.
 * - `maxCachedWorkflows`: sticky cache size. Derived from
 *   `heapSizeLimit` when TEMPORAL_MAX_CACHED_WORKFLOWS is unset.
 * - `workflowTaskSlots`: workflow tasks that may run at once, from the
 *   tuner. Undefined with a resource-based tuner, which sizes slots at
 *   runtime.
 *
 * @param {object} params Parameters.
 * @param {import('@temporalio/worker').Worker} params.worker The created Temporal worker.
 */
export const logIsolateSizing = ( { worker } ) => {
  const { workflowThreadPoolSize, reuseV8Context, maxCachedWorkflows, tuner, debugMode } = worker.options;
  // debugMode runs workflows in the main isolate and spawns no workflow threads.
  const isolateCount = debugMode ? 1 : 1 + workflowThreadPoolSize;
  const heapSizeLimit = getHeapStatistics().heap_size_limit;
  const memoryLimit = resolveMemoryLimit();
  const workflowTaskSlots = tuner?.workflowTaskSlotSupplier?.numSlots;
  const info = {
    workflowThreadPoolSize,
    reuseV8Context,
    isolateCount,
    heapSizeLimit,
    projectedCommittedHeap: isolateCount * heapSizeLimit,
    memoryLimit,
    maxCachedWorkflows,
    workflowTaskSlots
  };

  if ( info.projectedCommittedHeap > memoryLimit ) {
    log.warn( 'Worker isolates may commit more heap than the host allows', info );
    return;
  }

  if ( workflowTaskSlots > maxCachedWorkflows ) {
    log.warn( 'Worker runs more workflow tasks than it can cache, forcing replays', info );
    return;
  }

  log.info( 'Worker isolates', info );
};

/**
 * Start an interval that logs worker status and memory every
 * OUTPUT_WORKER_TELEMETRY_INTERVAL_MS. Disabled when it is 0.
 *
 * Each record holds the Temporal worker's `status` and a `memory`
 * block. The memory fields mix process-wide and main-isolate scopes:
 *
 * - `availableMemory`: memory the process can still allocate, within
 *   the container limit.
 * - `memoryLimit`: the container's limit, or the machine's total memory
 *   when unconstrained.
 * - `memoryUsage`: raw `process.memoryUsage()`. `rss` is process-wide;
 *   `heapTotal` and `heapUsed` cover only the main isolate.
 * - `nonMainHeap`: `memoryUsage.rss - memoryUsage.heapUsed`, the
 *   resident memory outside the main isolate's live objects: workflow
 *   thread heaps, Rust core allocations, buffers, and heap pages V8 has
 *   committed but not filled. An upper bound on the workflow thread
 *   heap, not a measurement of it. Cached workflow memory is counted
 *   here, so it grows with the cache while `heapUsed` stays flat.
 * - `heapSizeLimit`: the main isolate's V8 heap ceiling. Constant, but
 *   included in each sample so records are self-contained.
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
          memoryLimit: resolveMemoryLimit(),
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
