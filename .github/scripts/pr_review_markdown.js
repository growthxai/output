import schema from './pr_review.schema.json' with { type: 'json' };

/** Category names from the PR review JSON schema, in scorecard order. */
export const CATEGORIES = schema.properties.categories.required;

/**
 * Format one finding as a markdown ordered-list item.
 * First paragraph stays on the header line; further lines are indented so the item stays intact.
 * @param {{ severity: string, category: string, text?: string }} finding
 * @param {number} index
 * @returns {string}
 */
export const formatFinding = ( finding, index ) => {
  const n = index + 1;
  const indent = ' '.repeat( String( n ).length + 2 );
  const header = `${n}. **${finding.severity}** (${finding.category})`;
  const text = String( finding.text ?? '' ).trim();
  if ( !text ) {
    return header;
  }
  const [ first, ...rest ] = text.split( '\n' );
  const head = `${header}: ${first}`;
  if ( rest.length === 0 ) {
    return head;
  }
  const continuation = rest
    .map( line => ( line === '' ? '' : `${indent}${line}` ) )
    .join( '\n' );
  return `${head}\n${continuation}`;
};

/**
 * Sort Must-fix findings before Nice-to-have; preserve relative order within a severity.
 * @param {Array<{ severity: string, category: string, text?: string }>} findings
 * @returns {typeof findings}
 */
export const sortFindings = findings => [ ...findings ].sort( ( a, b ) => {
  if ( a.severity === b.severity ) {
    return 0;
  }
  return a.severity === 'Must-fix' ? -1 : 1;
} );

/**
 * @param {string} status
 * @returns {string}
 */
export const icon = status => ( status === 'PASS' ? '✅ PASS' : '⛔ FAIL' );

/**
 * Render the full PR review markdown body from structured review JSON.
 * @param {{ verdict: string, findings?: Array<{ severity: string, category: string, text?: string }>, categories?: Record<string, string> }} data
 * @returns {string}
 */
export const renderReviewMarkdown = data => {
  const findings = sortFindings( data.findings ?? [] );
  const findingsBlock = findings.length === 0 ?
    'None.' :
    findings.map( formatFinding ).join( '\n\n' );

  const categoriesBlock = CATEGORIES
    .map( name => `- ${name}: ${icon( data.categories?.[name] ?? 'PASS' )}` )
    .join( '\n' );

  return [
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
};
