import winston from 'winston';
import { shuffleArray } from '#utils';

const isProduction = process.env.NODE_ENV === 'production';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const colors = shuffleArray( [
  '033', // blue
  '030', // green
  '208', // orange
  '045', // turquoise
  '129', // purple
  '184' // yellow
] );
const assignedColors = new Map();

// Format metadata as friendly JSON: "{ name: "foo", count: 5 }"
const formatMeta = obj => {
  const entries = Object.entries( obj );
  if ( !entries.length ) {
    return '';
  }
  return ' { ' + entries.map( ( [ k, v ] ) => `${k}: ${JSON.stringify( v )}` ).join( ', ' ) + ' }';
};
// Distribute the namespace in a map and assign it the next available color
const getColor = v =>
  assignedColors.has( v ) ? assignedColors.get( v ) : assignedColors.set( v, colors[assignedColors.size % colors.length] ).get( v );

// Colorize a text using the namespace string
const colorizeByNamespace = ( namespace, text ) => `\x1b[38;5;${getColor( namespace )}m${text}\x1b[0m`;

// Development format: colorized with namespace prefix
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf( ( { level, message, namespace, service: _, environment: __, ...rest } ) => {
    const ns = 'Core' + ( namespace ? `.${namespace}` : '' );
    const meta = formatMeta( rest );
    return `[${level}] ${colorizeByNamespace( ns, `${namespace}: ${message}` )}${meta}`;
  } )
);

// Production format: structured JSON
const prodFormat = winston.format.combine(
  winston.format.timestamp( { format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' } ),
  winston.format.errors( { stack: true } ),
  winston.format.json()
);

export const logger = winston.createLogger( {
  levels,
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: {
    service: 'output-worker',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [ new winston.transports.Console() ]
} );

/**
 * Creates a child logger with a specific namespace
 *
 * @param {string} namespace - The namespace for this logger (e.g., 'Scanner', 'Tracing')
 * @returns {winston.Logger} Child logger instance with namespace metadata
 */
export const createChildLogger = namespace => logger.child( { namespace } );
