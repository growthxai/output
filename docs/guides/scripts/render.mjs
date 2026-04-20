#!/usr/bin/env node
/**
 * Regenerates Mintlify MDX pages from docs/guides/data/releases.json.
 *
 * - Rewrites docs/guides/changelog/index.mdx
 * - Rewrites docs/guides/migrations/index.mdx
 * - Rewrites/creates docs/guides/migrations/<slug>.mdx for every guide
 * - Updates docs/guides/docs.json nav entries for migration guides
 *
 * Reads only. Does not parse changesets, does not run `pnpm changeset version`.
 * Populating releases.json is the job of build_releases_json.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleasesJson } from './lib/store.mjs';
import {
  renderChangelogMdx,
  renderMigrationsIndexMdx,
  renderMigrationGuideMdx,
  renderNavUpdate
} from './lib/renderer.mjs';

const scriptDir = path.dirname( fileURLToPath( import.meta.url ) );
const guidesDir = path.resolve( scriptDir, '..' );
const repoRoot = path.resolve( guidesDir, '../..' );

const paths = {
  releasesJson: path.join( guidesDir, 'data/releases.json' ),
  changelogMdx: path.join( guidesDir, 'changelog/index.mdx' ),
  migrationsIndexMdx: path.join( guidesDir, 'migrations/index.mdx' ),
  migrationsDir: path.join( guidesDir, 'migrations' ),
  docsConfig: path.join( guidesDir, 'docs.json' )
};

async function readJson( filePath ) {
  return JSON.parse( await fs.readFile( filePath, 'utf8' ) );
}

async function writeJson( filePath, value ) {
  await fs.writeFile( filePath, `${JSON.stringify( value, null, 2 )}\n` );
}

async function main() {
  const data = await readReleasesJson( paths.releasesJson );

  await fs.writeFile( paths.changelogMdx, renderChangelogMdx( data ) );
  await fs.writeFile( paths.migrationsIndexMdx, renderMigrationsIndexMdx( data ) );

  await fs.mkdir( paths.migrationsDir, { recursive: true } );
  for ( const guide of data.migrationGuides ?? [] ) {
    const filePath = path.join( paths.migrationsDir, `${guide.slug}.mdx` );
    await fs.writeFile( filePath, renderMigrationGuideMdx( guide ) );
  }

  const config = await readJson( paths.docsConfig );
  await writeJson( paths.docsConfig, renderNavUpdate( config, data ) );

  console.log( `Rendered MDX from ${path.relative( repoRoot, paths.releasesJson )}.` );
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
