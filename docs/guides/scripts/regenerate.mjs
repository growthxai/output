#!/usr/bin/env node
/**
 * Regenerates the Mintlify changelog snippet from docs/guides/data/releases.json.
 *
 * - Rewrites docs/guides/snippets/changelog.mdx (<Update> blocks).
 *
 * The hand-written page at docs/guides/changelog/index.mdx imports and
 * inlines the snippet. Chrome and intro prose live there, not here.
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
import { renderChangelogSnippet } from './lib/renderer.mjs';

const scriptDir = path.dirname( fileURLToPath( import.meta.url ) );
const guidesDir = path.resolve( scriptDir, '..' );
const repoRoot = path.resolve( guidesDir, '../..' );

const paths = {
  releasesJson: path.join( guidesDir, 'data/releases.json' ),
  snippetsDir: path.join( guidesDir, 'snippets' ),
  changelogSnippet: path.join( guidesDir, 'snippets/changelog.mdx' )
};

async function main() {
  const data = await readReleasesJson( paths.releasesJson );

  await fs.mkdir( paths.snippetsDir, { recursive: true } );
  await fs.writeFile( paths.changelogSnippet, renderChangelogSnippet( data ) );

  console.log( `Regenerated changelog snippet from ${path.relative( repoRoot, paths.releasesJson )}.` );
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
