/**
 * Pure rendering functions — turn releases.json data into MDX snippet strings.
 *
 * The rendered output is consumed as Mintlify content snippets
 * (imported via `<Changelog />` / `<MigrationGuides />` in the hand-written
 * index pages). The snippets contain only the data-derived MDX; page chrome
 * (frontmatter, intro prose) lives in the index pages, not here.
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

  if ( release.migrationSlug ) {
    lines.push( 'See the matching section on the [Migrations](/migrations) page for upgrade steps.', '' );
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

function renderGuideSection( guide ) {
  const parts = [
    `### ${guide.fromLabel} → ${guide.toLabel}`,
    ''
  ];

  for ( const section of guide.sections ) {
    const packageLabel = section.packages.join( ', ' );
    parts.push( `#### ${packageLabel}`, '', section.summary, '', section.migration, '' );
  }

  return parts.join( '\n' );
}

export function renderMigrationGuidesSnippet( data ) {
  const guides = data.migrationGuides ?? [];
  const parts = [ AUTO_GENERATED_HEADER, '' ];

  if ( guides.length === 0 ) {
    parts.push(
      '<Note>',
      'No migration guides yet — the framework hasn\'t had a breaking change since this page was created. New sections land here automatically when a release ships with a `## Migration` section in its changeset.',
      '</Note>',
      ''
    );
    return parts.join( '\n' );
  }

  parts.push( guides.map( renderGuideSection ).join( '\n---\n\n' ), '' );
  return parts.join( '\n' );
}
