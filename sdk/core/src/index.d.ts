/**
 * Export all types from the interface
 *
 */
export * from './interface/index.d.ts';

/**
 * Exports all errors
 */
export * from './errors.d.ts';

/**
 * Expose z from Zod as a convenience.
 */
export { z } from 'zod';

/**
 * Continue the workflow as a new execution with fresh history.
 *
 * Re-exported from Temporal for advanced use cases. Prefer using
 * `context.control.continueAsNew()` within workflows for type-safe usage.
 *
 * @see {@link https://docs.temporal.io/develop/typescript/continue-as-new}
 */
export { continueAsNew } from '@temporalio/workflow';

/**
 * Exports Temporal's sleep() function for advanced use cases.
 * Pause workflow execution for a specified duration.
 *
 * Use this for delay-based throttling when calling external APIs.
 *
 * @example
 * ```ts
 * import { sleep } from '@outputai/core';
 *
 * for ( const url of urls ) {
 *   await fetchUrl( url );
 *   await sleep( 100 ); // 100ms delay between calls
 * }
 * ```
 *
 * @see {@link https://docs.temporal.io/develop/typescript/timers}
 *
 * @param ms - Duration to sleep in milliseconds (or a string like '1s', '100ms')
 * @returns A promise that resolves after the specified duration
 *
 */
export function sleep( ms: number | string ): Promise<void>;
