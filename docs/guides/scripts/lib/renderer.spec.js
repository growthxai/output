import { describe, expect, it } from 'vitest';
import { renderChangeBlock, renderChangelogBody } from './renderer.mjs';

const pkg = name => ( { name } );
const headings = text => text.match( /^#{1,6} .+$/gm ) ?? [];

describe( 'renderChangeBlock', () => {
  it( 'keeps a blank line between a demoted heading and a following fenced block', () => {
    // Fence splitting leaves the heading segment ending with `\n`. Demotion must
    // not eat that newline (or Mintlify parses `{ … }` in the fence as MDX), and
    // adds one more so the bold title is its own paragraph.
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/core' ) ],
      summary: [
        '### Source is "workflow"',
        '```js',
        '{ eventId, eventDate, source, workflowDetails, error }',
        '```',
        'Where `workflowDetails` is unchanged.'
      ].join( '\n' )
    } );

    expect( out ).toContain( '**Source is "workflow"**\n\n```js\n' );
    expect( out ).not.toMatch( /\*\*Source is "workflow"\*\*```/ );
    expect( out ).toContain( '{ eventId, eventDate, source, workflowDetails, error }' );
  } );

  it( 'demotes multiple heading levels before fences without gluing', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/core' ) ],
      summary: [
        '## Error hook',
        'Updated payloads.',
        '',
        '### Source is "activity"',
        '```js',
        '{ eventId, error }',
        '```',
        '',
        '### Source is "runtime"',
        '```js',
        '{ eventId }',
        '```'
      ].join( '\n' )
    } );

    expect( out ).toContain( '**Error hook**\n\n' );
    expect( out ).toContain( '**Source is "activity"**\n\n```js\n' );
    expect( out ).toContain( '**Source is "runtime"**\n\n```js\n' );
    expect( out ).not.toMatch( /\*\*[^*\n]+\*\*```/ );
  } );

  it( 'demotes a heading whose title starts with inline code (olive-moons shape)', () => {
    // Regression: splitting on inline code left a prose segment of "## " that
    // the heading regex could not match, so the ATX heading survived into MDX.
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/cli' ) ],
      summary: [
        '## `workflow start --monitor`',
        '',
        'Added a `--monitor` flag.'
      ].join( '\n' )
    } );

    expect( headings( out ) ).toEqual( [ '### `@outputai/cli`' ] );
    expect( out ).toContain( '**`workflow start --monitor`**\n\n' );
    expect( out ).toContain( 'Added a `--monitor` flag.' );
  } );

  it( 'demotes a heading with inline code in the middle of the title', () => {
    // Regression: mapProse used to turn this into `**Update**`x` here`.
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/cli' ) ],
      summary: '## Update `x` here\nbody'
    } );

    expect( headings( out ) ).toEqual( [ '### `@outputai/cli`' ] );
    expect( out ).toContain( '**Update `x` here**\n\nbody' );
    expect( out ).not.toContain( '**Update**`x`' );
  } );

  it( 'inserts a blank line so a GFM table after a demoted heading still parses', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/core' ) ],
      summary: [
        '## Options',
        '| Flag | Meaning |',
        '| --- | --- |',
        '| `-m` | monitor |'
      ].join( '\n' )
    } );

    expect( out ).toContain( '**Options**\n\n| Flag | Meaning |' );
    expect( out ).not.toMatch( /\*\*Options\*\*\n\|/ );
  } );

  it( 'collapses blank lines stacked by demotion when the changeset already had one', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/core' ) ],
      summary: '## Dependencies updates\n\n### Vulnerabilities fixed:\n- uuid: …'
    } );

    expect( out ).toContain( '**Dependencies updates**\n\n**Vulnerabilities fixed:**\n\n- uuid: …' );
    expect( out ).not.toContain( '**Dependencies updates**\n\n\n**Vulnerabilities fixed:**' );
  } );

  it( 'demotes summary headings that would leak into the page TOC', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/core' ) ],
      summary: '## Trace Changes\n- item\n\n### Nested\nbody'
    } );

    expect( headings( out ) ).toEqual( [ '### `@outputai/core`' ] );
    expect( out ).toContain( '**Trace Changes**' );
    expect( out ).toContain( '**Nested**' );
  } );

  it( 'puts the summary on its own line so a leading list marker is not glued to the package prefix', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/http' ) ],
      summary: '- Added a custom dispatcher\n- Added support for dispatcher in init'
    } );

    expect( out.startsWith( '### `@outputai/http`\n\n- Added a custom dispatcher\n' ) ).toBe( true );
  } );

  it( 'renders the package as a level-three heading without an em dash', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( 'output-api' ) ],
      summary: 'Workflow result endpoints changed.'
    } );

    expect( out.startsWith( '### `output-api`\n\nWorkflow result endpoints changed.' ) ).toBe( true );
    expect( out.split( '\n' )[0] ).toBe( '### `output-api`' );
    expect( out ).not.toContain( '—' );
  } );

  it( 'escapes bare < and { in prose but leaves fenced code verbatim', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/core' ) ],
      summary: [
        'Uses hono@<4.12.12 and {brace} in prose.',
        '```js',
        'const x = { a: 1 };',
        'if ( n < 4 ) {}',
        '```'
      ].join( '\n' )
    } );

    expect( out ).toContain( 'hono@&lt;4.12.12' );
    expect( out ).toContain( '&#123;brace}' );
    expect( out ).toContain( 'const x = { a: 1 };' );
    expect( out ).toContain( 'if ( n < 4 ) {}' );
  } );

  it( 'does not demote heading-like lines inside fenced code', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/cli' ) ],
      summary: [
        'Example:',
        '```md',
        '## Still a heading in the example',
        '```'
      ].join( '\n' )
    } );

    expect( out ).toContain( '```md\n## Still a heading in the example\n```' );
  } );

  it( 'does not collapse consecutive blank lines inside fenced code', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/cli' ) ],
      summary: [
        'Example:',
        '```txt',
        'before',
        '',
        '',
        'after',
        '```'
      ].join( '\n' )
    } );

    expect( out ).toContain( '```txt\nbefore\n\n\nafter\n```' );
  } );
} );

describe( 'renderChangelogBody', () => {
  it( 'renders update blocks with demoted headings and intact fences', () => {
    const body = renderChangelogBody( {
      releases: [ {
        version: '0.7.0',
        date: '2026-06-10',
        level: 'minor',
        changes: [ {
          packages: [ pkg( '@outputai/core' ) ],
          summary: '### Source is "workflow"\n```js\n{ eventId }\n```'
        } ]
      } ]
    }, new Map( [ [ '0.7.0', { from: '0.6.0', to: '0.7.0', slug: 'v0.6.0-to-v0.7.0' } ] ] ) );

    expect( body ).toContain( '<Update label="v0.7.0"' );
    expect( body ).toContain( 'See the [v0.6.0 - v0.7.0 migration guide]' );
    expect( body ).toContain( '**Source is "workflow"**\n\n```js\n{ eventId }\n```' );
    expect( body ).not.toMatch( /\*\*Source is "workflow"\*\*```/ );
  } );

  it( 'transforms grouped summaries independently', () => {
    const body = renderChangelogBody( {
      releases: [ {
        version: '0.12.0',
        date: '2026-09-01',
        level: 'minor',
        changes: [
          { packages: [ pkg( '@outputai/core' ) ], summary: 'Unclosed `code span.' },
          {
            packages: [ pkg( '@outputai/core' ) ],
            summary: 'Later <tag {value} and closing ` marker.'
          }
        ]
      } ]
    } );

    expect( body ).toContain( 'Later &lt;tag &#123;value} and closing ` marker.' );
  } );

  it( 'groups changes by exact package set while preserving their order', () => {
    const body = renderChangelogBody( {
      releases: [ {
        version: '0.12.0',
        date: '2026-09-01',
        level: 'minor',
        changes: [
          { packages: [ pkg( '@outputai/llm' ) ], summary: 'First LLM change.' },
          { packages: [ pkg( '@outputai/core' ) ], summary: 'Core change.' },
          { packages: [ pkg( '@outputai/llm' ) ], summary: 'Second LLM change.' },
          {
            packages: [ pkg( '@outputai/core' ), pkg( '@outputai/cli' ) ],
            summary: 'First shared change.'
          },
          {
            packages: [ pkg( '@outputai/cli' ), pkg( '@outputai/core' ) ],
            summary: 'Second shared change.'
          }
        ]
      } ]
    } );

    expect( body.match( /^### `@outputai\/llm`$/gm ) ).toHaveLength( 1 );
    expect( body.match( /^### `@outputai\/cli`, `@outputai\/core`$/gm ) ).toHaveLength( 1 );
    expect( body ).toContain( [
      '### `@outputai/llm`',
      '',
      'First LLM change.',
      '',
      'Second LLM change.'
    ].join( '\n' ) );
    expect( body ).toContain( [
      '### `@outputai/cli`, `@outputai/core`',
      '',
      'First shared change.',
      '',
      'Second shared change.'
    ].join( '\n' ) );
    expect( body.indexOf( '### `@outputai/llm`' ) ).toBeLessThan( body.indexOf( '### `@outputai/core`' ) );
  } );

  it( 'renders package-less and single-change groups', () => {
    const body = renderChangelogBody( {
      releases: [ {
        version: '0.12.0',
        date: '2026-09-01',
        level: 'minor',
        changes: [
          { packages: [], summary: 'First all-packages change.' },
          { packages: [ pkg( '@outputai/llm' ) ], summary: 'Only LLM change.' },
          { packages: [], summary: 'Second all-packages change.' }
        ]
      } ]
    } );

    expect( body.match( /^### All packages$/gm ) ).toHaveLength( 1 );
    expect( body ).toContain( [
      '### All packages',
      '',
      'First all-packages change.',
      '',
      'Second all-packages change.'
    ].join( '\n' ) );
    expect( body ).toContain( '### `@outputai/llm`\n\nOnly LLM change.' );
  } );
} );
