#!/usr/bin/env node
/**
 * Reads pending changesets and appends a new release entry to
 * docs/guides/data/releases.json.
 *
 * Called from ops/bump_release.sh BEFORE `pnpm changeset version` runs,
 * while the .changeset/*.md files are still on disk.
 *
 * Migration guides are hand-authored MDX pages under docs/guides/migrations/
 * and are not touched by this script.
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
  appendRelease
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

function today() {
  return new Date().toISOString().slice( 0, 10 );
}

function buildReleaseRecord( { toVersion, changesets, level } ) {
  return {
    version: toVersion,
    date: today(),
    level,
    changes: changesets.map( cs => ( {
      id: cs.file.replace( /\.md$/, '' ),
      packages: cs.packages,
      summary: cs.summary
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
  const release = buildReleaseRecord( { toVersion, changesets, level } );

  let data = await readReleasesJson( paths.releasesJson );
  data = appendRelease( data, release );

  await writeReleasesJson( paths.releasesJson, data );
  console.log( `Appended v${toVersion} to releases.json.` );
}

main().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
