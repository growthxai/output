#!/usr/bin/env node
/**
 * Read pending changesets, apply the version bump, then write a new <Update>
 * block to docs/guides/changelog/index.mdx and (if any changeset carries a
 * `## Migration` section) a dedicated migration guide under
 * docs/guides/migrations/.
 *
 * Runs from ops/bump_release.sh — replaces the direct `pnpm changeset version`
 * call so we can read the changeset bodies before they are consumed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const changesetsDir = path.join( repoRoot, '.changeset' );
const corePkgPath = path.join( repoRoot, 'sdk/core/package.json' );
const changelogPath = path.join( repoRoot, 'docs/guides/changelog/index.mdx' );
const migrationsIndexPath = path.join( repoRoot, 'docs/guides/migrations/index.mdx' );
const migrationsDir = path.join( repoRoot, 'docs/guides/migrations' );
const docsConfigPath = path.join( repoRoot, 'docs/guides/docs.json' );

const RELEASES_MARKER = '{/* RELEASES_BELOW — do not delete. The release generator inserts new <Update> blocks immediately after this marker. */}';
const GUIDES_MARKER = '{/* GUIDES_BELOW — do not delete. The release generator appends new migration guide links immediately after this marker. */}';

const MIGRATIONS_GROUP = 'Migrations';

const SKIP_FILES = new Set( [ 'README.md' ] );

async function readJson( file ) {
  return JSON.parse( await fs.readFile( file, 'utf8' ) );
}

async function writeJson( file, value ) {
  await fs.writeFile( file, `${JSON.stringify( value, null, 2 )}\n` );
}

function parseFrontmatter( text ) {
  return text
    .split( '\n' )
    .map( line => line.trim() )
    .filter( Boolean )
    .map( line => line.match( /^"([^"]+)":\s*(patch|minor|major)$/ ) )
    .filter( Boolean )
    .map( ( [ , name, bump ] ) => ( { name, bump } ) );
}

function splitSections( body ) {
  const match = body.match( /^##\s+Migration\s*$/im );
  if ( !match ) {
    return { summary: body.trim(), migration: null };
  }

  const summary = body.slice( 0, match.index ).trim();
  const rest = body.slice( match.index + match[0].length );
  const nextHeading = rest.search( /^##\s+/m );
  const migration = ( nextHeading === -1 ? rest : rest.slice( 0, nextHeading ) ).trim();

  return { summary, migration };
}

function parseChangeset( raw ) {
  const match = raw.match( /^---\n([\s\S]*?)\n---\n([\s\S]*)$/ );
  if ( !match ) {
    return null;
  }

  const [ , frontmatterText, body ] = match;
  const packages = parseFrontmatter( frontmatterText );
  if ( packages.length === 0 ) {
    return null;
  }

  return { packages, ...splitSections( body ) };
}

async function readChangesets() {
  const files = await fs.readdir( changesetsDir );
  const parsed = [];

  for ( const file of files ) {
    if ( !file.endsWith( '.md' ) || SKIP_FILES.has( file ) ) {
      continue;
    }
    const raw = await fs.readFile( path.join( changesetsDir, file ), 'utf8' );
    const changeset = parseChangeset( raw );
    if ( changeset ) {
      parsed.push( { file, ...changeset } );
    }
  }

  return parsed;
}

function highestBump( changesets ) {
  const bumps = changesets.flatMap( c => c.packages.map( p => p.bump ) );
  if ( bumps.includes( 'major' ) ) {
    return 'major';
  }
  if ( bumps.includes( 'minor' ) ) {
    return 'minor';
  }
  return 'patch';
}

function minorSlug( version ) {
  const [ major, minor ] = version.split( '.' );
  return `v${major}.${minor}`;
}

function migrationSlug( fromVersion, toVersion ) {
  return `${minorSlug( fromVersion )}-to-${minorSlug( toVersion )}`;
}

function buildUpdateBlock( { toVersion, today, level, changesets, hasMigration, migrationSlugId, fromVersion } ) {
  const lines = [
    `<Update label="v${toVersion}" description="${today} · ${level} release">`,
    ''
  ];

  for ( const cs of changesets ) {
    const packageLabel = cs.packages.map( p => `\`${p.name}\` (${p.bump})` ).join( ', ' );
    lines.push( `**${packageLabel}**`, '', cs.summary, '' );
  }

  if ( hasMigration ) {
    const label = `${minorSlug( fromVersion )} → ${minorSlug( toVersion )} migration guide`;
    const href = `/migrations/${migrationSlugId}`;
    lines.push( `Upgrading from an earlier version? See the [${label}](${href}).`, '' );
  }

  lines.push( '</Update>' );
  return lines.join( '\n' );
}

async function prependToChangelog( block ) {
  const existing = await fs.readFile( changelogPath, 'utf8' );
  if ( !existing.includes( RELEASES_MARKER ) ) {
    throw new Error( `Missing release marker in ${changelogPath}. Restore the RELEASES_BELOW comment.` );
  }
  await fs.writeFile( changelogPath, existing.replace( RELEASES_MARKER, `${RELEASES_MARKER}\n\n${block}` ) );
}

async function writeMigrationGuide( { slug, fromVersion, toVersion, entries } ) {
  const filePath = path.join( migrationsDir, `${slug}.mdx` );
  const header = [
    '---',
    `title: "${minorSlug( fromVersion )} → ${minorSlug( toVersion )}"`,
    `description: "How to move from Output ${minorSlug( fromVersion )} to ${minorSlug( toVersion )}."`,
    '---',
    '',
    `This guide covers every breaking change between \`v${fromVersion}\` and \`v${toVersion}\`. Apply each section in order.`,
    '',
    '## Automate the upgrade',
    '',
    'The CLI can apply most of these changes for you:',
    '',
    '```bash',
    `npx output migrate --to ${toVersion}`,
    '```',
    '',
    'It reads this page, walks through the steps below, updates your dependencies, and runs your type checker.',
    ''
  ];

  const sections = entries.flatMap( entry => {
    const packageLabel = entry.packages.map( p => p.name ).join( ', ' );
    return [ `## ${packageLabel}`, '', entry.summary, '', entry.migration, '' ];
  } );

  await fs.writeFile( filePath, [ ...header, ...sections ].join( '\n' ) );
}

async function appendMigrationLink( { slug, fromVersion, toVersion } ) {
  const existing = await fs.readFile( migrationsIndexPath, 'utf8' );
  if ( !existing.includes( GUIDES_MARKER ) ) {
    throw new Error( `Missing guides marker in ${migrationsIndexPath}. Restore the GUIDES_BELOW comment.` );
  }
  const link = `- [${minorSlug( fromVersion )} → ${minorSlug( toVersion )}](/migrations/${slug})`;
  const cleaned = existing.replace( /\n<Note>[\s\S]*?<\/Note>\n?/, '\n' );
  await fs.writeFile( migrationsIndexPath, cleaned.replace( GUIDES_MARKER, `${GUIDES_MARKER}\n\n${link}` ) );
}

async function registerMigrationPageInNav( slug ) {
  const config = await readJson( docsConfigPath );
  const group = config.navigation.groups.find( g => g.group === MIGRATIONS_GROUP );
  if ( !group ) {
    throw new Error( `Navigation group "${MIGRATIONS_GROUP}" not found in docs.json` );
  }
  const pagePath = `migrations/${slug}`;
  if ( group.pages.includes( pagePath ) ) {
    return;
  }
  group.pages.push( pagePath );
  await writeJson( docsConfigPath, config );
}

async function run() {
  const changesets = await readChangesets();
  if ( changesets.length === 0 ) {
    console.log( 'No pending changesets — skipping docs generation.' );
    execSync( 'pnpm changeset version', { cwd: repoRoot, stdio: 'inherit' } );
    return;
  }

  const fromVersion = ( await readJson( corePkgPath ) ).version;

  execSync( 'pnpm changeset version', { cwd: repoRoot, stdio: 'inherit' } );

  const toVersion = ( await readJson( corePkgPath ) ).version;
  if ( fromVersion === toVersion ) {
    console.log( 'Version unchanged after `changeset version` — skipping docs generation.' );
    return;
  }

  const level = highestBump( changesets );
  const today = new Date().toISOString().slice( 0, 10 );
  const migrationEntries = changesets.filter( c => c.migration );
  const hasMigration = migrationEntries.length > 0;
  const slug = migrationSlug( fromVersion, toVersion );

  await prependToChangelog( buildUpdateBlock( {
    toVersion,
    today,
    level,
    changesets,
    hasMigration,
    migrationSlugId: slug,
    fromVersion
  } ) );

  if ( hasMigration ) {
    await writeMigrationGuide( { slug, fromVersion, toVersion, entries: migrationEntries } );
    await appendMigrationLink( { slug, fromVersion, toVersion } );
    await registerMigrationPageInNav( slug );
  }

  console.log( `Wrote changelog entry for v${toVersion}${hasMigration ? ` and migration guide ${slug}` : ''}.` );
}

run().catch( err => {
  console.error( err );
  process.exit( 1 );
} );
