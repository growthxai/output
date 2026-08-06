/**
 * Pure rendering functions — turn releases.json data into MDX strings.
 *
 * renderChangelogBody() returns the <Update> blocks that get spliced into the
 * hand-written changelog page (docs/guides/changelog/index.mdx) between its
 * AUTO-GENERATED markers. Migration guides are hand-authored under
 * docs/guides/migrations/; when a guide's "to" version matches a release, a
 * relative link is prepended to that release's block.
 */

// MDX reads a bare `<` as the start of a JSX tag and `{` as an expression, so
// arbitrary changeset prose (e.g. `hono@<4.12.12`, `</style>`) breaks parsing
// and drops the whole page. Escape those two characters in the prose parts of
// the summary, leaving inline-code spans and fenced code blocks verbatim.
function escapeMdxText( text ) {
  const codeSpans = /(```[\s\S]*?```|`[^`]*`)/g;
  return text
    .split( codeSpans )
    .map( ( segment, i ) => i % 2 === 1
      ? segment
      : segment.replace( /</g, '&lt;' ).replace( /\{/g, '&#123;' ) )
    .join( '' );
}

function renderChangeBlock( change ) {
  const inner = change.packages.length === 0
    ? 'All packages'
    : change.packages.map( p => `\`${p.name}\`` ).join( ', ' );
  return `**${inner}** — ${escapeMdxText( change.summary )}`;
}

function renderMigrationLink( guide ) {
  return `See the [v${guide.from} → v${guide.to} migration guide](/migrations/${guide.slug}).`;
}

function renderUpdateBlock( release, migrationByToVersion ) {
  const lines = [
    `<Update label="v${release.version}" description="${release.date} · ${release.level} release">`,
    ''
  ];

  const guide = migrationByToVersion.get( release.version );
  if ( guide ) {
    lines.push( renderMigrationLink( guide ), '' );
  }

  for ( const change of release.changes ) {
    lines.push( renderChangeBlock( change ), '' );
  }

  lines.push( '</Update>' );
  return lines.join( '\n' );
}

/**
 * @param {{ releases?: Array<{ version: string, date: string, level: string, changes: unknown[] }> }} data
 * @param {Map<string, { from: string, to: string, slug: string }>} [migrationByToVersion]
 */
export function renderChangelogBody( data, migrationByToVersion = new Map() ) {
  const updateBlocks = ( data.releases ?? [] )
    .map( release => renderUpdateBlock( release, migrationByToVersion ) );

  if ( updateBlocks.length === 0 ) {
    return [ '<Note>', 'No releases yet.', '</Note>' ].join( '\n' );
  }

  return updateBlocks.join( '\n\n' );
}
