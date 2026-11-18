import * as stackTraceParser from 'stacktrace-parser';

// OS separator, but in a deterministic way, allowing this to work in Temporal's sandbox
// This avoids importing from node:path
const SEP = new Error().stack.includes( '/' ) ? '/' : '\\';
const transformSeparators = path => path.replaceAll( '/', SEP );

const defaultIgnorePaths = [
  '/@outputai/core/',
  'node:internal/',
  'evalmachine.',
  'webpack/bootstrap'
];

const ownFileSuffix = `helpers${SEP}path.js`;

/**
 * Return the first immediate directory of the file invoking the code that called this function.
 *
 * Excludes `@outputai/core` (located via this file's own frame, so it works from any install or monorepo path),
 * node, other internal paths, and any additional ignore paths.
 *
 * @param {string[]} [additionalIgnorePaths]
 * @returns {string}
 */
export const resolveInvocationDir = ( additionalIgnorePaths = [] ) => {
  const stack = new Error().stack;
  const lines = stackTraceParser.parse( stack );
  const ignorePaths = [ ...additionalIgnorePaths, ...defaultIgnorePaths ].map( transformSeparators );

  const ownFile = lines[0]?.file ?? '';
  const coreSrcDir = ownFile.endsWith( ownFileSuffix ) ? ownFile.slice( 0, -ownFileSuffix.length ) : null;
  const isIgnored = file => ( coreSrcDir && file.startsWith( coreSrcDir ) ) || ignorePaths.some( p => file.includes( p ) );

  const frame = lines.find( l => !isIgnored( l.file ) );
  if ( !frame ) {
    throw new Error( `Invocation dir resolution via stack trace failed. Stack: ${stack}` );
  }
  return frame.file.replace( 'file://', '' ).split( SEP ).slice( 0, -1 ).join( SEP );
};
