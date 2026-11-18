import type { z } from 'zod';
import type { ActivityOptions } from '@temporalio/workflow';
/**
 * Similar to `Partial<T>` but applies to nested properties recursively, creating a deep optional variant of `T`:
 * - Objects: All properties become optional, recursively.
 * - Functions: Preserved as‑is (only the property itself becomes optional).
 * - Primitives: Returned unchanged.
 * Useful for config overrides with strong IntelliSense on nested fields and methods.
 */
export type DeepPartial<T> =
  T extends ( ...args: any[] ) => unknown ? T : // eslint-disable-line @typescript-eslint/no-explicit-any
    T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } :
      T;

/**
 * Type alias for any Zod schema type.
 */
export type AnyZodSchema = z.ZodType<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Native Temporal configurations for activities.
 *
 * All native options are accepted except 'versioningIntent', 'taskQueue', 'allowEagerDispatch'.
 *
 * @see {@link https://typescript.temporal.io/api/interfaces/common.ActivityOptions}
 */
export type TemporalActivityOptions = Omit<ActivityOptions, 'versioningIntent' | 'taskQueue' | 'allowEagerDispatch'>;
