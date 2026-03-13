// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { validateExecuteInParallel } from './validations/static.js';

/**
 * Execute jobs in parallel with optional concurrency limit.
 *
 * Returns all job results (successes and failures) sorted by original job index.
 *
 * @param {Array<Function>} jobs Array of functions to execute
 * @param {Number} [concurrency] Max concurrent jobs, default is Infinity (no concurrency limit)
 * @param {Function} [onJobCompleted] Optional callback invoked as each job completes
 */
export const executeInParallel = async ( { jobs, concurrency = Infinity, onJobCompleted } ) => {
  validateExecuteInParallel( { jobs, concurrency, onJobCompleted } );
  // allows this function to be called without testing over and over to check if it is not null;
  const onJobCompletedSafeCb = onJobCompleted ?? ( _ => 0 );
  const results = [];
  const jobsCount = jobs.length;
  const jobsPool = jobs.slice().map( ( job, index ) => ( {
    index,
    fn: async () => {
      try {
        const result = await job();
        return { ok: true, result, index };
      } catch ( error ) {
        return { ok: false, error, index };
      }
    },
    promise: null
  } ) );

  const activeJobs = jobsPool.splice( 0, concurrency );
  activeJobs.forEach( job => job.promise = job.fn() ); // start jobs

  while ( results.length < jobsCount ) {
    const result = await Promise.race( activeJobs.map( job => job.promise ) );
    results.push( result );
    onJobCompletedSafeCb( result );

    activeJobs.splice( activeJobs.findIndex( job => job.index === result.index ), 1 ); // remove completed job

    if ( jobsPool.length > 0 ) {
      const nextJob = jobsPool.shift();
      nextJob.promise = nextJob.fn();
      activeJobs.push( nextJob );
    }
  }

  return results.sort( ( a, b ) => a.index - b.index );
};
