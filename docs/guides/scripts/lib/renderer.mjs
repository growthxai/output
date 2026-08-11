/**
 * Pure rendering functions — turn releases.json data into MDX strings.
 *
 * renderChangelogBody() returns the <Update> blocks that get spliced into the
 * hand-written changelog page (docs/guides/changelog/index.mdx) between its
 * AUTO-GENERATED markers. Migration guides are hand-authored under
 * docs/guides/migrations/; when a guide's "to" version matches a release, a
 * relative link is prepended to that release's block.
 */

// Apply a transform only outside fenced code blocks (``` … ```).
function mapOutsideFences( text, transform ) {
  const fences = /(```[\s\S]*?```)/g;
  return text
    .split( fences )
    .map( ( segment, i ) => ( i % 2 === 1 ? segment : transform( segment ) ) )
    .join( '' );
}

// Apply a transform only outside inline/fenced code so changeset examples stay
// verbatim while surrounding MDX prose can be escaped or rewritten.
function mapProse( text, transform ) {
  const codeSpans = /(```[\s\S]*?```|`[^`]*`)/g;
  return text
    .split( codeSpans )
    .map( ( segment, i ) => ( i % 2 === 1 ? segment : transform( segment ) ) )
    .join( '' );
}

// MDX reads a bare `<` as the start of a JSX tag and `{` as an expression, so
// arbitrary changeset prose (e.g. `hono@<4.12.12`, `</style>`) breaks parsing
// and drops the whole page. Escape those two characters in the prose parts of
// the summary, leaving inline-code spans and fenced code blocks verbatim.
function escapeMdxText( text ) {
  return mapProse( text, segment =>
    segment.replace( /</g, '&lt;' ).replace( /\{/g, '&#123;' )
  );
}

// Changeset summaries often use `##` section titles. If left as ATX headings
// they become page-level <h2>s inside <Update> and leak into Mintlify's TOC.
function demoteMarkdownHeadings( text ) {
  // Split on fences only — not inline code. mapProse would carve
  // `## `workflow start --monitor`` into "## " + "`…`" and the heading regex
  // (which needs [ \t]+(.+?)) would miss, leaving a real <h2>. Mid-title
  // inline code would also mangle `## Update `x` here` into `**Update**`x` here`.
  //
  // Emit an extra newline after the bold title so a following GFM table is
  // separated from the paragraph (tables cannot interrupt a paragraph; lists
  // and fences can).
  //
  // Only strip spaces/tabs at EOL — not `\s`. With fence splitting the prose
  // segment often ends in `\n`; `\s*$` would eat it and glue `**Title**```js`.
  return mapOutsideFences( text, segment =>
    segment.replace(
      /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm,
      ( _match, _hashes, title ) => `**${title}**\n`
    )
  );
}

// The extra newline after demotion stacks with blank lines already in the
// changeset (`## A\n\n## B` → three newlines). Keep a single blank line.
function collapseExtraBlankLines( text ) {
  return mapOutsideFences( text, segment => segment.replace( /\n{3,}/g, '\n\n' ) );
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
