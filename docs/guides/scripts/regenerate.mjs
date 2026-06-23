#!/usr/bin/env node
/**
 * Regenerates the changelog from docs/guides/data/releases.json.
 *
 * Splices the generated <Update> blocks into the hand-written changelog page
 * (docs/guides/changelog/index.mdx), replacing everything between its
 * AUTO-GENERATED:START / END markers. The intro prose above the markers is
 * left untouched.
 *
 * Migration guides are hand-authored MDX pages under docs/guides/migrations/
 * and are NOT regenerated.
 *
 * Reads only. Does not parse changesets, does not run `pnpm changeset version`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleasesJson } from './lib/store.mjs';
import { renderChangelogBody } from './lib/renderer.mjs';

const scriptDir = path.dirname( fileURLToPath( import.meta.url ) );
const guidesDir = path.resolve( scriptDir, '..' );
const repoRoot = path.resolve( guidesDir, '../..' );

const MARKER_START_PREFIX = '{/* AUTO-GENERATED:START';
const MARKER_END = '{/* AUTO-GENERATED:END */}';

const paths = {
  releasesJson: path.join( guidesDir, 'data/releases.json' ),
  changelogPage: path.join( guidesDir, 'changelog/index.mdx' )
};

// Replace everything between the markers with `body`, leaving the surrounding
// page intact. Returns null when the markers are missing or out of order so
// the caller can fail loudly instead of silently emptying the page. Full-region
// replacement keeps re-runs byte-identical (idempotent).
function spliceBody( current, body ) {
  const lines = current.split( '\n' );
  const startIdx = lines.findIndex( line => line.trimStart().startsWith( MARKER_START_PREFIX ) );
  const endIdx = lines.findIndex( ( line, i ) => i > startIdx && line.trim() === MARKER_END );

  if ( startIdx === -1 || endIdx === -1 ) return null;

  const head = lines.slice( 0, startIdx + 1 ).join( '\n' );
  const tail = lines.slice( endIdx ).join( '\n' );
  return `${head}\n\n${body}\n\n${tail}`.replace( /\n*$/, '\n' );
}

async function main() {
  const data = await readReleasesJson( paths.releasesJson );
  const current = await fs.readFile( paths.changelogPage, 'utf8' );
  const next = spliceBody( current, renderChangelogBody( data ) );

  if ( next === null ) {
    console.error(
      `Could not find the AUTO-GENERATED markers in ${path.relative( repoRoot, paths.changelogPage )}.\n` +
      `Add this marker pair where the changelog should render:\n` +
      `  ${MARKER_START_PREFIX} — do not edit by hand. Run ./ops/regenerate_docs.sh */}\n` +
      `  ${MARKER_END}`
    );
    process.exit( 1 );
  }

  await fs.writeFile( paths.changelogPage, next );
  console.log( `Regenerated changelog in ${path.relative( repoRoot, paths.changelogPage )} from ${path.relative( repoRoot, paths.releasesJson )}.` );
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
