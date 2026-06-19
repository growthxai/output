/**
 * A log entry's optional structured metadata. Merged into each line alongside
 * the auto-injected workflow execution fields (workflowId, runId, activityId,
 * activityType, workflowType). On key collision, the values you pass win.
 */
export type LogMeta = Record<string, unknown>;

/**
 * Step logger — a drop-in replacement for `console.*` inside steps.
 *
 * Every line is automatically enriched with the current workflow execution
 * context (workflowId, runId, activityId, activityType, workflowType), so logs
 * emitted from steps are traceable in production (e.g. filterable by
 * `workflowId` in Render). Output matches the framework's own lifecycle logs:
 * structured JSON in production, a readable colored line in development.
 *
 * Called outside a step (scripts, tests), it still logs — just without the
 * execution context fields, and never throws.
 *
 * @example
 * ```js
 * import { logger } from '@outputai/core/logger';
 *
 * export const fetchRows = step( {
 *   name: 'fetchRows',
 *   fn: async () => {
 *     logger.info( 'fetched rows', { count: 12 } );
 *     // prod: {"level":"info","message":"fetched rows","workflowId":"...","count":12,...}
 *   }
 * } );
 * ```
 *
 * @remarks
 * Use this in steps, evaluators, and shared code that runs inside a step — **not
 * in workflow bodies**. Workflows run in a Temporal sandbox that cannot load the
 * underlying logger; importing this into workflow code (or a module shared with
 * one) fails the workflow bundle build.
 */
export interface Logger {
  /** Log at the `info` level. */
  info( message: string, meta?: LogMeta ): void;
  /** Log at the `warn` level. */
  warn( message: string, meta?: LogMeta ): void;
  /** Log at the `error` level. */
  error( message: string, meta?: LogMeta ): void;
  /** Log at the `debug` level. */
  debug( message: string, meta?: LogMeta ): void;
  /** Alias for {@link Logger.info} — for `console.log` muscle memory. */
  log( message: string, meta?: LogMeta ): void;
}

export declare const logger: Logger;
