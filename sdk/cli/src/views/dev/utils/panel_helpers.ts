import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { format, parseISO } from 'date-fns';

/**
 * Capitalize a short UI label.
 */
export const capitalize = ( value: string ): string => value.charAt( 0 ).toUpperCase() + value.slice( 1 );

export const formatContentTitle = ( parts: string[] ): string => parts.join( ' › ' );

export const hasJsonValue = ( value: unknown ): boolean => {
  if ( value === undefined || value === null ) {
    return false;
  }
  if ( Array.isArray( value ) ) {
    return value.length > 0;
  }
  return typeof value !== 'object' || Object.keys( value ).length > 0;
};

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

export const cycleValue = <T>( values: readonly T[], current: T, direction: 1 | -1 ): T => {
  const idx = values.indexOf( current );
  return values[( idx + direction + values.length ) % values.length];
};

export const clampIndex = ( index: number, count: number ): number =>
  Math.max( 0, Math.min( index, Math.max( 0, count - 1 ) ) );

export const useListSelection = (
  count: number,
  initialIndex: number | ( () => number ) = 0
): {
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  selectPrevious: () => void;
  selectNext: () => void;
} => {
  const [ rawIndex, setSelectedIndex ] = useState( initialIndex );
  const selectedIndex = clampIndex( rawIndex, count );

  useEffect( () => {
    if ( selectedIndex !== rawIndex ) {
      setSelectedIndex( selectedIndex );
    }
  }, [ rawIndex, selectedIndex ] );

  return {
    selectedIndex,
    setSelectedIndex,
    selectPrevious: () => setSelectedIndex( i => Math.max( 0, i - 1 ) ),
    selectNext: () => setSelectedIndex( i => Math.min( Math.max( 0, count - 1 ), i + 1 ) )
  };
};
