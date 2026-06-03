import { format, transports } from 'winston';
import { isPlainObject, shuffleArray } from '#utils';

/** Available colors enum */
const Color = {
  Blue: '033',
  Green: '030',
  Orange: '208',
  Turquoise: '045',
  Purple: '129',
  Yellow: '184'
};

/**
 * Recursively format object as friendly JSON: { name: "foo", count: 5 }
 *
 * @param {any} v - The input value
 * @returns {string} Formatted result
 */
export const formatJson = v => {
  if ( isPlainObject( v ) ) {
    const entries = Object.entries( v );
    return entries.length === 0 ? '{}' :
      `{ ${entries.map( ( [ k, v ] ) => `${k}: ${formatJson( v )}` ).join( ', ' )} }`;
  }
  if ( Array.isArray( v ) ) {
    return v.length === 0 ? '[]' : `[ ${v.map( p => formatJson( p ) ).join( ', ' )} ]`;
  }
  if ( typeof v === 'string' ) {
    return JSON.stringify( v );
  }
  return v;
};

/** This instance color schema */
const COLORS = shuffleArray( Object.values( Color ) );

/** Stores all assigned colors per namespace. */
const assignedColors = new Map();

/**
 * Get the previous assigned color for this value or if not present, assign a new one an store it
 * @param {string} v - A text value
 * @returns {string} The color
 * */
const getColor = v =>
  assignedColors.get( v ) ?? assignedColors.set( v, COLORS[assignedColors.size % COLORS.length] ).get( v );

export const options = {
  level: 'debug',
  transports: [ new transports.Console() ],
  format: format.combine(
    format.colorize(),
    format.metadata(),
    format.printf( ( { level, message, metadata } ) => {
      const { namespace, ...fields } = metadata;
      const jsonText = Object.keys( fields ).length > 0 ? formatJson( fields ) : null;
      return `[${level}] \x1b[38;5;${getColor( namespace )}m${namespace}: ${message}\x1b[0m${jsonText ? ' ' + jsonText : ''}`;
    } )
  )
};
