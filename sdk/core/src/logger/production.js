import { transports, format } from 'winston';

export const options = {
  level: 'info',
  transports: [ new transports.Console() ],
  defaultMeta: {
    service: 'output-worker',
    environment: process.env.NODE_ENV
  },
  format: format.combine(
    format.timestamp( { format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' } ),
    format.errors( { stack: true } ),
    format.json()
  )
};
