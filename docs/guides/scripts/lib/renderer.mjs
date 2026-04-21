/**
 * Pure rendering functions — turn releases.json data into MDX snippet strings.
 *
 * Only the changelog is generated. Migration guides are hand-authored
 * under docs/guides/migrations/ and linked from the hand-written
 * migrations/index.mdx page.
 */

const AUTO_GENERATED_HEADER = '{/* AUTO-GENERATED from docs/guides/data/releases.json. Run `./ops/regenerate_docs.sh` to update. */}';

function renderChangeBlock( change ) {
  const inner = change.packages.length === 0
    ? 'All packages'
    : change.packages.map( p => `\`${p.name}\`` ).join( ', ' );
  return `**${inner}** — ${change.summary}`;
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

export function renderChangelogSnippet( data ) {
  const updateBlocks = ( data.releases ?? [] ).map( renderUpdateBlock );
  const parts = [ AUTO_GENERATED_HEADER, '' ];

  if ( updateBlocks.length === 0 ) {
    parts.push(
      '<Note>',
      'No releases yet.',
      '</Note>',
      ''
    );
    return parts.join( '\n' );
  }

  parts.push( updateBlocks.join( '\n\n' ), '' );
  return parts.join( '\n' );
}
