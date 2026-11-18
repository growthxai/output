import { getHistory } from './get_history.js';
import { getInput } from './get_input.js';
import { getResult } from './get_result.js';
import { getStatus } from './get_status.js';
import { listRuns } from './list_runs.js';
import { reset } from './reset.js';
import { run } from './run.js';
import { start } from './start.js';
import { stop } from './stop.js';
import { streamHistory } from './stream_history.js';
import { terminate } from './terminate.js';
import { signal, query, executeUpdate } from './communication.js';

export const getWorkflowMethods = context => Object.fromEntries(
  Object.entries( {
    executeUpdate,
    getHistory,
    getInput,
    getResult,
    getStatus,
    listRuns,
    query,
    reset,
    run,
    signal,
    start,
    stop,
    streamHistory,
    terminate
  } ).map( ( [ k, v ] ) => [ k, v.bind( null, context ) ] )
);

