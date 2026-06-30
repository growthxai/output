/**
 * Workflow type emitted by Temporal's catalog refresh, used to drop the
 * routine completed catalog rows from the Recent Runs list while still
 * surfacing failing or running ones for diagnostics.
 */
export const CATALOG_WORKFLOW_NAME = '$catalog';

/**
 * Visible row counts and per-pane layout knobs. Co-located here so the
 * top-of-file constant blocks across panels stay terse.
 */
export const WORKFLOWS_VISIBLE_ROWS = 8;
export const WORKFLOWS_RECENT_RUNS_LIMIT = 5;

export const RUNS_VISIBLE_ROWS = 8;

export const RUN_DETAIL_VISIBLE_STEPS = 12;

export const MIN_TERMINAL_COLUMNS = 100;
export const MIN_TERMINAL_ROWS = 40;

export const HELP_DOCS_URL = 'https://docs.output.ai';
