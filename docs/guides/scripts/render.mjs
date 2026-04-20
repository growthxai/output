#!/usr/bin/env node
/**
 * Release docs entrypoint.
 *
 * Two modes:
 *
 *   default (release):
 *     - Reads .changeset/*.md
 *     - Reads current version from sdk/core/package.json
 *     - Runs `pnpm changeset version`
 *     - Reads new version
 *     - Appends a new release + optional migration guide to releases.json
 *     - Renders MDX and updates docs.json nav
 *
 *   --regenerate:
 *     - Reads releases.json
 *     - Re-renders MDX + docs.json nav without touching changesets or versions
 *     - Used by the docs_regenerate GitHub Action and for local typo fixes
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  readChangesets,
  highestBump
} from './lib/changeset_parser.mjs';
import {
  readReleasesJson,
  writeReleasesJson,
  appendRelease,
  addMigrationGuide
} from './lib/store.mjs';
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
  changesetsDir: path.join( repoRoot, '.changeset' ),
  corePkg: path.join( repoRoot, 'sdk/core/package.json' ),
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

function minorSlug( version ) {
  const [ major, minor ] = version.split( '.' );
  return `v${major}.${minor}`;
}

function migrationSlug( fromVersion, toVersion ) {
  return `${minorSlug( fromVersion )}-to-${minorSlug( toVersion )}`;
}

function today() {
  return new Date().toISOString().slice( 0, 10 );
}

function buildReleaseRecord( { toVersion, changesets, level, migrationSlugId } ) {
  return {
    version: toVersion,
    date: today(),
    level,
    changes: changesets.map( cs => ( {
      id: cs.file.replace( /\.md$/, '' ),
      packages: cs.packages,
      summary: cs.summary
    } ) ),
    migrationSlug: migrationSlugId
  };
}

function buildMigrationGuide( { slug, fromVersion, toVersion, entries } ) {
  return {
    slug,
    fromVersionFull: fromVersion,
    toVersionFull: toVersion,
    fromLabel: minorSlug( fromVersion ),
    toLabel: minorSlug( toVersion ),
    sections: entries.map( entry => ( {
      packages: entry.packages.map( p => p.name ),
      summary: entry.summary,
      migration: entry.migration
    } ) )
  };
}

async function emitAllMdx( data ) {
  await fs.writeFile( paths.changelogMdx, renderChangelogMdx( data ) );
  await fs.writeFile( paths.migrationsIndexMdx, renderMigrationsIndexMdx( data ) );

  await fs.mkdir( paths.migrationsDir, { recursive: true } );
  for ( const guide of data.migrationGuides ?? [] ) {
    const filePath = path.join( paths.migrationsDir, `${guide.slug}.mdx` );
    await fs.writeFile( filePath, renderMigrationGuideMdx( guide ) );
  }

  const config = await readJson( paths.docsConfig );
  const updated = renderNavUpdate( config, data );
  await writeJson( paths.docsConfig, updated );
}

async function runRegenerate() {
  const data = await readReleasesJson( paths.releasesJson );
  await emitAllMdx( data );
  console.log( `Re-rendered MDX from ${path.relative( repoRoot, paths.releasesJson )}.` );
}

async function runRelease() {
  const changesets = await readChangesets( paths.changesetsDir );

  if ( changesets.length === 0 ) {
    console.log( 'No pending changesets — running `pnpm changeset version` but skipping docs generation.' );
    execSync( 'pnpm changeset version', { cwd: repoRoot, stdio: 'inherit' } );
    return;
  }

  const fromVersion = ( await readJson( paths.corePkg ) ).version;
  execSync( 'pnpm changeset version', { cwd: repoRoot, stdio: 'inherit' } );
  const toVersion = ( await readJson( paths.corePkg ) ).version;

  if ( fromVersion === toVersion ) {
    console.log( 'Version unchanged after `changeset version` — skipping docs generation.' );
    return;
  }

  const level = highestBump( changesets );
  const migrationEntries = changesets.filter( c => c.migration );
  const slug = migrationEntries.length > 0
    ? migrationSlug( fromVersion, toVersion )
    : null;

  const release = buildReleaseRecord( {
    toVersion,
    changesets,
    level,
    migrationSlugId: slug
  } );

  let data = await readReleasesJson( paths.releasesJson );
  data = appendRelease( data, release );

  if ( slug ) {
    const guide = buildMigrationGuide( {
      slug,
      fromVersion,
      toVersion,
      entries: migrationEntries
    } );
    data = addMigrationGuide( data, guide );
  }

  await writeReleasesJson( paths.releasesJson, data );
  await emitAllMdx( data );

  console.log( `Wrote release v${toVersion}${slug ? ` and migration guide ${slug}` : ''}.` );
}

async function main() {
  const mode = process.argv.includes( '--regenerate' ) ? 'regenerate' : 'release';
  if ( mode === 'regenerate' ) {
    await runRegenerate();
  } else {
    await runRelease();
  }
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
