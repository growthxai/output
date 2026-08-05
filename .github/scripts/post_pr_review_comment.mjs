#!/usr/bin/env node
/**
 * Renders structured PR review JSON to the markdown summary and posts it.
 * Env: STRUCTURED_OUTPUT (JSON). Arg: <pr-number>
 */
import { spawnSync } from 'node:child_process';
import schema from './pr_review.schema.json' with { type: 'json' };

const CATEGORIES = schema.properties.categories.required;

const prNumber = process.argv[ 2 ];
const raw = process.env.STRUCTURED_OUTPUT ?? '';

if ( !prNumber ) {
  console.error( 'Usage: STRUCTURED_OUTPUT=\'{...}\' post_pr_review_comment.mjs <pr-number>' );
  process.exit( 1 );
}

if ( !raw ) {
  console.log( 'No structured_output — skipping comment.' );
  process.exit( 0 );
}

const data = JSON.parse( raw );
const icon = status => ( status === 'PASS' ? '✅ PASS' : '⛔ FAIL' );

const findings = [ ...( data.findings ?? [] ) ].sort( ( a, b ) => {
  if ( a.severity === b.severity ) {
    return 0;
  }
  return a.severity === 'Must-fix' ? -1 : 1;
} );

const findingsBlock = findings.length === 0
  ? 'None.'
  : findings
    .map( ( f, i ) => `${i + 1}. **${f.severity}** (${f.category}): ${f.text}` )
    .join( '\n' );

const categoriesBlock = CATEGORIES
  .map( name => `- ${name}: ${icon( data.categories?.[ name ] ?? 'PASS' )}` )
  .join( '\n' );

const body = [
  '## PR review',
  '',
  '### Verdict',
  icon( data.verdict ),
  '',
  '### Findings',
  findingsBlock,
  '',
  '### Categories',
  categoriesBlock,
  ''
].join( '\n' );

const result = spawnSync(
  'gh',
  [ 'pr', 'comment', prNumber, '--body', body ],
  { encoding: 'utf8' }
);
if ( result.status !== 0 ) {
  console.error( result.stderr || result.stdout );
  process.exit( result.status ?? 1 );
}
console.log( result.stdout.trim() );
