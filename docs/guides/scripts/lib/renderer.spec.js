import { describe, expect, it } from 'vitest';
import { renderChangeBlock, renderChangelogBody } from './renderer.mjs';

const pkg = name => ( { name } );

describe( 'renderChangeBlock', () => {
  it( 'keeps a newline between a demoted heading and a following fenced block', () => {
    // mapProse splits the fence into its own segment, so the heading segment
    // ends with `\n`. Demotion must not eat that newline or Mintlify parses
    // `{ … }` inside the fence as an MDX expression ("Could not parse
    // expression with acorn").
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

    expect( out ).toContain( '**Source is "workflow"**\n```js\n' );
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

    expect( out ).toContain( '**Error hook**\n' );
    expect( out ).toContain( '**Source is "activity"**\n```js\n' );
    expect( out ).toContain( '**Source is "runtime"**\n```js\n' );
    expect( out ).not.toMatch( /\*\*[^*\n]+\*\*```/ );
  } );

  it( 'leaves no ATX headings that would leak into the page TOC', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/core' ) ],
      summary: '## Trace Changes\n- item\n\n### Nested\nbody'
    } );

    expect( out ).not.toMatch( /^#{1,6} /m );
    expect( out ).toContain( '**Trace Changes**' );
    expect( out ).toContain( '**Nested**' );
  } );

  it( 'puts the summary on its own line so a leading list marker is not glued to the package prefix', () => {
    const out = renderChangeBlock( {
      packages: [ pkg( '@outputai/http' ) ],
      summary: '- Added a custom dispatcher\n- Added support for dispatcher in init'
    } );

    expect( out.startsWith( '**`@outputai/http`** —\n\n- Added a custom dispatcher\n' ) ).toBe( true );
    expect( out ).not.toContain( '— - ' );
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
    expect( body ).toContain( 'See the [v0.6.0 → v0.7.0 migration guide]' );
    expect( body ).toContain( '**Source is "workflow"**\n```js\n{ eventId }\n```' );
    expect( body ).not.toMatch( /\*\*Source is "workflow"\*\*```/ );
  } );
} );
