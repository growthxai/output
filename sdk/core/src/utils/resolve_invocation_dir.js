import * as stackTraceParser from 'stacktrace-parser';

// OS separator, but in a deterministic way, allowing this to work in Temporal's sandbox
// This avoids importing from node:path
const SEP = new Error().stack.includes( '/' ) ? '/' : '\\';

const transformSeparators = path => path.replaceAll( '/', SEP );
const defaultIgnorePaths = [
  '/@outputai/core/',
  '/@outputai/llm/',
  '/@outputai/evals/',
  '/sdk/core/',
  '/sdk/llm/',
  '/sdk/evals/',
  'node:internal/',
  'evalmachine.',
  'webpack/bootstrap'
];

/**
 * Return the directory of the file invoking the code that called this function
 * Excludes some internal paths and the sdk itself
 */
export default ( additionalIgnorePaths = [] ) => {
  const stack = new Error().stack;
  const lines = stackTraceParser.parse( stack );
  const ignorePaths = [ ...additionalIgnorePaths, ...defaultIgnorePaths ].map( transformSeparators );

  const frame = lines.find( l => !ignorePaths.some( p => l.file.includes( p ) ) );
  if ( !frame ) {
    throw new Error( `Invocation dir resolution via stack trace failed. Stack: ${stack}` );
  }
  return frame.file.replace( 'file://', '' ).split( SEP ).slice( 0, -1 ).join( SEP );
};
