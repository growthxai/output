#!/usr/bin/env node
/**
 * Renders structured PR review JSON to the markdown summary and posts it.
 * Env: STRUCTURED_OUTPUT (JSON). Arg: <pr-number>
 */
import { spawnSync } from 'node:child_process';
import { renderReviewMarkdown } from './pr_review_markdown.js';

const prNumber = process.argv[2];
const raw = process.env.STRUCTURED_OUTPUT ?? '';

if ( !prNumber ) {
  console.error( 'Usage: STRUCTURED_OUTPUT=\'{...}\' post_pr_review_comment.mjs <pr-number>' );
  process.exit( 1 );
}

if ( !raw ) {
  console.log( 'No structured_output — skipping comment.' );
  process.exit( 0 );
}

const body = renderReviewMarkdown( JSON.parse( raw ) );

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
