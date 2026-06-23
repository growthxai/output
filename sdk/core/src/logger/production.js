import { transports, format } from 'winston';

export const options = {
  level: process.env.OUTPUT_LOG_LEVEL ?? 'info',
  transports: [ new transports.Console() ],
  defaultMeta: {
    service: 'output-worker',
    environment: 'production'
  },
  format: format.combine(
    format.timestamp( { format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' } ),
    format.errors( { stack: true } ),
    format.json()
  )
};
