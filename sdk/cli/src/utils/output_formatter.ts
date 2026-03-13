import { OUTPUT_FORMAT, OutputFormat } from './constants.js';

export function formatOutput<T>(
  result: T,
  format: OutputFormat,
  textFormatter: ( result: T ) => string = result => JSON.stringify( result, null, 2 )
): string {
  switch ( format ) {
    case OUTPUT_FORMAT.JSON:
      return JSON.stringify( result, null, 2 );
    case OUTPUT_FORMAT.TEXT:
      return textFormatter( result );
    default:
      return textFormatter( result );
  }
}
