/**
 * Result of a single job executed by `executeInParallel`.
 *
 * @typeParam T - The return type of the job function
 */
export type ParallelJobResult<T> =
  | { ok: true; result: T; index: number } |
  { ok: false; error: Error; index: number };

// For a single job function type F, produce ParallelJobResult<R> where R is the resolved return type.
// We use ( ...args: never[] ) => so we match any no-arg callable; Promise<infer R> | infer R lets us
// infer R from either a Promise or a plain value. Awaited<R> normalizes so we always get the
// unwrapped type (e.g. Awaited<Promise<X>> = X).
type InferJobResult<F> = F extends ( ...args: never[] ) => Promise<infer R> | infer R ?
  ParallelJobResult<Awaited<R>> :
  never;

// Map the jobs tuple T to a tuple of result types: result[i] has the type for jobs[i]'s return.
// Constraint "readonly ( () => Promise<unknown> | unknown )[]" does two things: (1) T must be an
// array/tuple so we can map over keyof T (indices). (2) "readonly" preserves tuple inference when
// you pass a literal like [ () => a(), () => b() ] — without it, T can be inferred as a mutable
// array and we lose per-index types (all results would get the same element type).
type ParallelResults<T extends readonly ( () => Promise<unknown> | unknown )[]> = {
  [K in keyof T]: InferJobResult<T[K]>;
};

/**
 * Execute jobs in parallel with optional concurrency limit.
 *
 * Returns all job results (successes and failures) sorted by original job index.
 * Each result contains `ok` (boolean), `index` (original position), and either
 * `result` (on success) or `error` (on failure).
 *
 * Jobs must be wrapped in arrow functions—do not pass promises directly.
 *
 * @example
 * ```ts
 * const results = await executeInParallel( {
 *   jobs: [
 *     () => myStep( data1 ),
 *     () => myStep( data2 ),
 *     () => myStep( data3 )
 *   ],
 *   concurrency: 2
 * } );
 *
 * // Handle the discriminated union (result only exists when ok is true)
 * const successfulResults = results.filter( r => r.ok ).map( r => r.result );
 *
 * // Or handle each result individually
 * for ( const r of results ) {
 *   if ( r.ok ) {
 *     console.log( `Job ${r.index} succeeded:`, r.result );
 *   } else {
 *     console.log( `Job ${r.index} failed:`, r.error );
 *   }
 * }
 * ```
 *
 * @param params - Parameters object
 * @param params.jobs - Array of arrow functions returning step/activity calls (not promises directly)
 * @param params.concurrency - Max concurrent jobs (default: Infinity)
 * @param params.onJobCompleted - Optional callback invoked as each job completes (in completion order)
 * @returns Array of results sorted by original job index
 */
// T extends readonly (...)[] so T is inferred as a tuple when a literal array is passed, giving
// per-index result types. onJobCompleted gets ParallelResults<T>[number] (union of all result
// types); when all jobs return the same type that union is a single type, so the callback is
// (result: ParallelJobResult<ThatType>) => void. When jobs have mixed return types it's a union.
export declare function executeInParallel<T extends readonly ( () => Promise<unknown> | unknown )[]>(
  params: {
    jobs: T;
    concurrency?: number;
    onJobCompleted?: ( result: ParallelResults<T>[number] ) => void;
  }
): Promise<ParallelResults<T>>;
