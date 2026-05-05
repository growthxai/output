import { format, parseISO } from 'date-fns';

/**
 * Truncate a string to fit a column, appending an ellipsis when clipped.
 */
export const truncate = ( str: string, max: number ): string =>
  str.length > max ? `${str.slice( 0, max - 1 )}…` : str;

/**
 * Format an ISO timestamp into the short `MMM d HH:mm` form used in panel
 * row tables (e.g. `Apr 28 18:56`). Returns `-` when the input is missing
 * or unparseable.
 */
export const formatStartedShort = ( iso: string | undefined ): string => {
  if ( !iso ) {
    return '-';
  }
  try {
    return format( parseISO( iso ), 'MMM d HH:mm' );
  } catch {
    return '-';
  }
};

/**
 * Compute the index of the first visible row for a windowed list. Keeps
 * the selected row centred when possible and clamps so the window never
 * runs off the end of the array.
 */
export const computeWindowStart = (
  selectedIndex: number,
  total: number,
  visibleRows: number
): number => {
  const half = Math.floor( visibleRows / 2 );
  const start = Math.max( 0, selectedIndex - half );
  const maxStart = Math.max( 0, total - visibleRows );
  return Math.min( start, maxStart );
};
