#!/usr/bin/env node
/**
 * Regenerates Mintlify content snippets from docs/guides/data/releases.json.
 *
 * - Rewrites docs/guides/snippets/changelog.mdx (<Update> blocks).
 * - Rewrites docs/guides/snippets/migration_guides.mdx (H3 sections per guide).
 *
 * The hand-written index pages at docs/guides/{changelog,migrations}/index.mdx
 * import and inline these snippets. Chrome and intro prose live there, not here.
 *
 * Reads only. Does not parse changesets, does not run `pnpm changeset version`.
 * Populating releases.json is the job of build_releases_json.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleasesJson } from './lib/store.mjs';
import {
  renderChangelogSnippet,
  renderMigrationGuidesSnippet
} from './lib/renderer.mjs';

const scriptDir = path.dirname( fileURLToPath( import.meta.url ) );
const guidesDir = path.resolve( scriptDir, '..' );
const repoRoot = path.resolve( guidesDir, '../..' );

const paths = {
  releasesJson: path.join( guidesDir, 'data/releases.json' ),
  snippetsDir: path.join( guidesDir, 'snippets' ),
  changelogSnippet: path.join( guidesDir, 'snippets/changelog.mdx' ),
  migrationGuidesSnippet: path.join( guidesDir, 'snippets/migration_guides.mdx' )
};

async function main() {
  const data = await readReleasesJson( paths.releasesJson );

  await fs.mkdir( paths.snippetsDir, { recursive: true } );
  await fs.writeFile( paths.changelogSnippet, renderChangelogSnippet( data ) );
  await fs.writeFile( paths.migrationGuidesSnippet, renderMigrationGuidesSnippet( data ) );

  console.log( `Regenerated snippets from ${path.relative( repoRoot, paths.releasesJson )}.` );
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
