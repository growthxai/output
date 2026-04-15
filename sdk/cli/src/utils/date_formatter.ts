/**
 * Date and duration formatting utilities
 */
import { format, formatDistanceStrict, formatDuration as formatDurationFns, intervalToDuration, parseISO } from 'date-fns';

/**
 * Format a duration in milliseconds to a human-readable string.
 * Uses date-fns for durations >= 1 minute, custom formatting for shorter durations.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "150ms", "2.50s", "3 minutes 45 seconds")
 */
export function formatDuration( ms: number ): string {
  const duration = intervalToDuration( { start: 0, end: ms } );

  if ( ms < 1000 ) {
    return `${ms}ms`;
  }

  if ( ms < 60000 ) {
    const seconds = ms / 1000;
    return `${seconds.toFixed( 2 )}s`;
  }

  return formatDurationFns( duration, { format: [ 'minutes', 'seconds' ] } );
}

/**
 * Format an ISO date string to a human-readable format
 *
 * @param isoString - ISO 8601 date string
 * @returns Formatted date string (e.g., "Dec 3, 2025 10:30 AM")
 */
export function formatDate( isoString: string | null | undefined ): string {
  if ( !isoString ) {
    return '-';
  }
  return format( parseISO( isoString ), 'MMM d, yyyy h:mm a' );
}

/**
 * Calculate elapsed milliseconds between two ISO timestamps.
 * If completedAt is null/undefined, uses current time (for in-progress durations).
 */
export function elapsedMs( startedAt: string, completedAt?: string | null ): number {
  const start = parseISO( startedAt ).getTime();
  const end = completedAt ? parseISO( completedAt ).getTime() : Date.now();
  return end - start;
}

/**
 * Format a duration in milliseconds to a compact string that fits in narrow columns.
 * Always returns a short single-token string (e.g., "150ms", "7.56s", "24.2m", "1.3h").
 */
export function formatDurationCompact( ms: number ): string {
  if ( ms < 1000 ) {
    return `${ms}ms`;
  }
  if ( ms < 60_000 ) {
    return `${( ms / 1000 ).toFixed( 2 )}s`;
  }
  if ( ms < 3_600_000 ) {
    return `${( ms / 60_000 ).toFixed( 1 )}m`;
  }
  return `${( ms / 3_600_000 ).toFixed( 1 )}h`;
}

/**
 * Format a duration between two ISO timestamps.
 *
 * @param startedAt - ISO 8601 start timestamp
 * @param completedAt - ISO 8601 end timestamp (or null if still running)
 * @returns Human-readable duration string (e.g., "5 seconds", "running")
 */
export function formatDurationFromTimestamps( startedAt: string, completedAt: string | null | undefined ): string {
  if ( !completedAt ) {
    return 'running';
  }
  const start = parseISO( startedAt );
  const end = parseISO( completedAt );
  return formatDistanceStrict( start, end, { addSuffix: false } );
}
