import * as stackTraceParser from 'stacktrace-parser';

// OS separator, but in a deterministic way, allowing this to work in Temporal's sandbox
// This avoids importing from node:path
const SEP = new Error().stack.includes( '/' ) ? '/' : '\\';
const transformSeparators = path => path.replaceAll( '/', SEP );

const defaultIgnorePaths = [
  '/@outputai/core/',
  '/sdk/core/',
  'node:internal/',
  'evalmachine.',
  'webpack/bootstrap'
];

/**
 * Return the first immediate directory of the file invoking the code that called this function.
 *
 * Excludes `@outputai/core`, node, other internal paths, and any additional ignore paths.
 *
 * @param {string[]} [additionalIgnorePaths]
 * @returns {string}
 */
export const resolveInvocationDir = ( additionalIgnorePaths = [] ) => {
  const stack = new Error().stack;
  const lines = stackTraceParser.parse( stack );
  const ignorePaths = [ ...additionalIgnorePaths, ...defaultIgnorePaths ].map( transformSeparators );

  const frame = lines.find( l => !ignorePaths.some( p => l.file.includes( p ) ) );
  if ( !frame ) {
    throw new Error( `Invocation dir resolution via stack trace failed. Stack: ${stack}` );
  }
  return frame.file.replace( 'file://', '' ).split( SEP ).slice( 0, -1 ).join( SEP );
};
