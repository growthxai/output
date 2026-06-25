/**
 * Pure rendering functions — turn releases.json data into MDX strings.
 *
 * renderChangelogBody() returns the <Update> blocks that get spliced into the
 * hand-written changelog page (docs/guides/changelog/index.mdx) between its
 * AUTO-GENERATED markers. Migration guides are hand-authored under
 * docs/guides/migrations/ and are not generated.
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

function renderUpdateBlock( release ) {
  const lines = [
    `<Update label="v${release.version}" description="${release.date} · ${release.level} release">`,
    ''
  ];

  for ( const change of release.changes ) {
    lines.push( renderChangeBlock( change ), '' );
  }

  lines.push( '</Update>' );
  return lines.join( '\n' );
}

export function renderChangelogBody( data ) {
  const updateBlocks = ( data.releases ?? [] ).map( renderUpdateBlock );

  if ( updateBlocks.length === 0 ) {
    return [ '<Note>', 'No releases yet.', '</Note>' ].join( '\n' );
  }

  return updateBlocks.join( '\n\n' );
}
