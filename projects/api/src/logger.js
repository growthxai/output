import winston from 'winston';
import { api, isProduction } from '#configs';

// Custom log levels including 'http' for Morgan integration
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Development format: human-friendly colorized
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf( ( { level, message, service: _, environment: __, ...rest } ) => {
    const meta = Object.keys( rest ).length ? ` ${JSON.stringify( rest )}` : '';
    return `[${level}] ${message}${meta}`;
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
  level: isProduction ? 'http' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: {
    service: api.serviceName,
    environment: api.nodeEnv
  },
  transports: [ new winston.transports.Console() ]
} );
