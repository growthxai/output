/**
 * Pure rendering functions - turn releases.json data into MDX strings.
 *
 * renderChangelogBody() returns the <Update> blocks that get spliced into the
 * hand-written changelog page (docs/guides/changelog/index.mdx) between its
 * AUTO-GENERATED markers. Migration guides are hand-authored under
 * docs/guides/migrations/; when a guide's "to" version matches a release, a
 * relative link is prepended to that release's block.
 */

const FENCE_RE = /(```[\s\S]*?```)/g;
const CODE_OR_FENCE_RE = /(```[\s\S]*?```|`[^`]*`)/g;

// Apply a transform only outside segments matched by `splitRe` (odd split parts).
function mapOutside( splitRe, text, transform ) {
  return text
    .split( splitRe )
    .map( ( segment, i ) => ( i % 2 === 1 ? segment : transform( segment ) ) )
    .join( '' );
}

// MDX reads a bare `<` as the start of a JSX tag and `{` as an expression, so
// arbitrary changeset prose (e.g. `hono@<4.12.12`, `</style>`) breaks parsing
// and drops the whole page. Escape those two characters in the prose parts of
// the summary, leaving inline-code spans and fenced code blocks verbatim.
function escapeMdxText( text ) {
  return mapOutside( CODE_OR_FENCE_RE, text, segment =>
    segment.replace( /</g, '&lt;' ).replace( /\{/g, '&#123;' )
  );
}

// Changeset summaries often use `##` section titles. If left as ATX headings
// they become page-level <h2>s inside <Update> and leak into Mintlify's TOC.
function demoteMarkdownHeadings( text ) {
  // Split on fences only - not inline code. Splitting on inline code would carve
  // `## `workflow start --monitor`` into "## " + "`…`" and the heading regex
  // (which needs [ \t]+(.+?)) would miss, leaving a real <h2>. Mid-title
  // inline code would also mangle `## Update `x` here` into `**Update**`x` here`.
  //
  // Emit an extra newline after the bold title so a following GFM table is
  // separated from the paragraph (tables cannot interrupt a paragraph; lists
  // and fences can).
  //
  // Only strip spaces/tabs at EOL - not `\s`. With fence splitting the prose
  // segment often ends in `\n`; `\s*$` would eat it and glue `**Title**```js`.
  return mapOutside( FENCE_RE, text, segment =>
    segment.replace(
      /^(?:#{1,6})[ \t]+(.+?)[ \t]*$/gm,
      ( _match, title ) => `**${title}**\n`
    )
  );
}

// The extra newline after demotion stacks with blank lines already in the
// changeset (`## A\n\n## B` becomes three newlines). Keep a single blank line.
function collapseExtraBlankLines( text ) {
  return mapOutside( FENCE_RE, text, segment => segment.replace( /\n{3,}/g, '\n\n' ) );
}

/**
 * Render one changelog change as MDX (package line + summary).
 * @param {{ packages: Array<{ name: string }>, summary: string }} change
 * @returns {string}
 */
export function renderChangeBlock( change ) {
  const inner = change.packages.length === 0
    ? 'All packages'
    : change.packages.map( p => `\`${p.name}\`` ).join( ', ' );
  // Package label on its own line, then the summary, so a leading `##` or `-`
  // in the summary stays a block construct instead of trailing the label.
  const summary = escapeMdxText( collapseExtraBlankLines( demoteMarkdownHeadings( change.summary ) ) );
  return `**${inner}**\n\n${summary}`;
}

function groupChangesByPackageSet( changes ) {
  const groups = new Map();

  for ( const change of changes ) {
    const packages = [ ...change.packages ].sort( ( a, b ) => a.name.localeCompare( b.name ) );
    const key = JSON.stringify( packages.map( pkg => pkg.name ) );
    const group = groups.get( key );

    if ( group ) {
      group.summaries.push( change.summary );
      continue;
    }

    groups.set( key, {
      packages,
      summaries: [ change.summary ]
    } );
  }

  return groups.values();
}

function renderMigrationLink( guide ) {
  return `See the [v${guide.from} - v${guide.to} migration guide](/migrations/${guide.slug}).`;
}

function renderUpdateBlock( release, migrationByToVersion ) {
  const lines = [
    `<Update label="v${release.version}" description="${release.date} - ${release.level} release">`,
    ''
  ];

  const guide = migrationByToVersion.get( release.version );
  if ( guide ) {
    lines.push( renderMigrationLink( guide ), '' );
  }

  for ( const group of groupChangesByPackageSet( release.changes ) ) {
    lines.push( renderChangeBlock( {
      packages: group.packages,
      summary: group.summaries.join( '\n\n---\n\n' )
    } ), '' );
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
