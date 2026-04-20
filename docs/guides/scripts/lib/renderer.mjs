/**
 * Pure rendering functions — turn releases.json data into MDX strings.
 * No I/O in this module. Tests can exercise every function by feeding it
 * the JSON shape and asserting on the returned string.
 */

const AUTO_GENERATED_HEADER = '{/* AUTO-GENERATED from docs/guides/data/releases.json. Edit the JSON and run `node docs/guides/scripts/render.mjs --regenerate`. */}';

const CHANGELOG_FRONTMATTER = `---
title: "Changelog"
description: "Release notes for the Output framework. Every change to @outputai/* packages and output-api shows up here."
---`;

const CHANGELOG_INTRO = `The Output framework uses a fixed version group — \`@outputai/core\`, \`@outputai/cli\`, \`@outputai/llm\`, \`@outputai/http\`, \`@outputai/credentials\`, \`@outputai/evals\`, \`@outputai/framework\`, and \`output-api\` all share one version number and release together.

Releases with breaking changes link to a migration guide. If you're upgrading across several versions, start at [Migrations](/migrations) and chain the guides in order.`;

const MIGRATIONS_FRONTMATTER = `---
title: "Migrations"
description: "Upgrade guides for moving between versions of the Output framework."
---`;

const MIGRATIONS_INTRO = `Every release that introduces a breaking change has a migration guide. Each guide covers one version boundary (e.g. \`v0.1\` → \`v0.2\`), so if you're jumping several versions you apply them in order.

## How to upgrade

The fastest path is the CLI:

\`\`\`bash
npx output migrate
\`\`\`

It reads the \`@outputai/*\` version in your \`package.json\`, looks up the matching guide on this page, applies the changes, and runs your type checker.

## Guides`;

const MIGRATIONS_INDEX_GROUP = 'Migration Guides';

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
    const guide = `See the [migration guide](/migrations/${release.migrationSlug}) for upgrade steps.`;
    lines.push( guide, '' );
  }

  lines.push( '</Update>' );
  return lines.join( '\n' );
}

export function renderChangelogMdx( data ) {
  const updateBlocks = ( data.releases ?? [] ).map( renderUpdateBlock );
  const parts = [
    CHANGELOG_FRONTMATTER,
    '',
    AUTO_GENERATED_HEADER,
    '',
    CHANGELOG_INTRO,
    ''
  ];
  if ( updateBlocks.length > 0 ) {
    parts.push( updateBlocks.join( '\n\n' ), '' );
  }
  return `${parts.join( '\n' )}`;
}

export function renderMigrationsIndexMdx( data ) {
  const guides = data.migrationGuides ?? [];
  const parts = [
    MIGRATIONS_FRONTMATTER,
    '',
    AUTO_GENERATED_HEADER,
    '',
    MIGRATIONS_INTRO,
    ''
  ];

  if ( guides.length === 0 ) {
    parts.push(
      '<Note>',
      'No migration guides yet — the framework hasn\'t had a breaking change since this index was created. New guides land here automatically when a release ships with a `## Migration` section in its changeset.',
      '</Note>',
      ''
    );
    return parts.join( '\n' );
  }

  const links = guides.map( g => `- [${g.fromLabel} → ${g.toLabel}](/migrations/${g.slug})` );
  parts.push( links.join( '\n' ), '' );
  return parts.join( '\n' );
}

export function renderMigrationGuideMdx( guide ) {
  const parts = [
    '---',
    `title: "${guide.fromLabel} → ${guide.toLabel}"`,
    `description: "How to move from Output ${guide.fromLabel} to ${guide.toLabel}."`,
    '---',
    '',
    AUTO_GENERATED_HEADER,
    '',
    `This guide covers every breaking change between \`v${guide.fromVersionFull}\` and \`v${guide.toVersionFull}\`. Apply each section in order.`,
    '',
    '## Automate the upgrade',
    '',
    'The CLI can apply most of these changes for you:',
    '',
    '```bash',
    `npx output migrate --to ${guide.toVersionFull}`,
    '```',
    '',
    'It reads this page, walks through the steps below, updates your dependencies, and runs your type checker.',
    ''
  ];

  for ( const section of guide.sections ) {
    const packageLabel = section.packages.join( ', ' );
    parts.push(
      `## ${packageLabel}`,
      '',
      section.summary,
      '',
      section.migration,
      ''
    );
  }

  return parts.join( '\n' );
}

function findGroup( nodes, name ) {
  for ( const node of nodes ) {
    if ( typeof node !== 'object' || node === null ) {
      continue;
    }
    if ( node.group === name ) {
      return node;
    }
    if ( Array.isArray( node.pages ) ) {
      const nested = findGroup( node.pages, name );
      if ( nested ) {
        return nested;
      }
    }
  }
  return null;
}

export function renderNavUpdate( config, data ) {
  const next = structuredClone( config );
  const group = findGroup( next.navigation.groups, MIGRATIONS_INDEX_GROUP );
  if ( !group ) {
    throw new Error( `Navigation group "${MIGRATIONS_INDEX_GROUP}" not found in docs.json` );
  }

  const desiredSlugs = ( data.migrationGuides ?? [] ).map( g => `migrations/${g.slug}` );
  const deduped = [ 'migrations/index', ...desiredSlugs ];
  group.pages = Array.from( new Set( deduped ) );
  return next;
}
