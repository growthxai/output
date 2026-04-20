#!/usr/bin/env node
/**
 * Reads pending changesets and appends a new release entry (plus optional
 * migration guide) to docs/guides/data/releases.json.
 *
 * Called from ops/bump_release.sh BEFORE `pnpm changeset version` runs,
 * while the .changeset/*.md files are still on disk.
 *
 * Does not run the version bump and does not render MDX — those are
 * explicit separate steps in the release pipeline.
 *
 * Usage:
 *   node docs/guides/scripts/build_releases_json.mjs --from 0.1.12 --to 0.2.0
 */
import path from 'node:path';
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

const scriptDir = path.dirname( fileURLToPath( import.meta.url ) );
const guidesDir = path.resolve( scriptDir, '..' );
const repoRoot = path.resolve( guidesDir, '../..' );

const paths = {
  changesetsDir: path.join( repoRoot, '.changeset' ),
  releasesJson: path.join( guidesDir, 'data/releases.json' )
};

function parseFlag( name ) {
  const withEquals = process.argv.find( a => a.startsWith( `--${name}=` ) );
  if ( withEquals ) {
    return withEquals.slice( `--${name}=`.length );
  }
  const idx = process.argv.indexOf( `--${name}` );
  if ( idx >= 0 && idx + 1 < process.argv.length ) {
    return process.argv[ idx + 1 ];
  }
  return null;
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

async function main() {
  const fromVersion = parseFlag( 'from' );
  const toVersion = parseFlag( 'to' );

  if ( !fromVersion || !toVersion ) {
    console.error( 'Usage: build_releases_json.mjs --from <version> --to <version>' );
    process.exit( 2 );
  }

  if ( fromVersion === toVersion ) {
    console.log( `FROM and TO both at ${fromVersion} — skipping releases.json update.` );
    return;
  }

  const changesets = await readChangesets( paths.changesetsDir );
  if ( changesets.length === 0 ) {
    console.log( 'No pending changesets — skipping releases.json update.' );
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
  console.log( `Appended v${toVersion}${slug ? ` and migration guide ${slug}` : ''} to releases.json.` );
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
