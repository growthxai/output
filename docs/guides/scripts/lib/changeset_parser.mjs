/**
 * Parse .changeset/*.md files into structured data.
 * Extracted from the previous ops/generate_docs_from_changesets.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const SKIP_FILES = new Set( [ 'README.md' ] );

export function parseFrontmatter( text ) {
  return text
    .split( '\n' )
    .map( line => line.trim() )
    .filter( Boolean )
    .map( line => line.match( /^"([^"]+)":\s*(patch|minor|major)$/ ) )
    .filter( Boolean )
    .map( ( [ , name, bump ] ) => ( { name, bump } ) );
}

export function splitSections( body ) {
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

export function parseChangeset( raw ) {
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

export async function readChangesets( changesetsDir ) {
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

export function highestBump( changesets ) {
  const bumps = changesets.flatMap( c => c.packages.map( p => p.bump ) );
  if ( bumps.includes( 'major' ) ) {
    return 'major';
  }
  if ( bumps.includes( 'minor' ) ) {
    return 'minor';
  }
  return 'patch';
}
