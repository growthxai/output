import { describe, it, expect } from 'vitest';
import {
  formatFinding,
  sortFindings,
  icon,
  renderReviewMarkdown,
  CATEGORIES
} from './pr_review_markdown.js';

describe( 'formatFinding()', () => {
  it( 'puts the first paragraph on the header line', () => {
    expect( formatFinding( {
      severity: 'Nice-to-have',
      category: 'Quality',
      text: 'Single-line finding.'
    }, 0 ) ).toBe( '1. **Nice-to-have** (Quality): Single-line finding.' );
  } );

  it( 'indents continuation lines so multi-paragraph text stays in the list item', () => {
    expect( formatFinding( {
      severity: 'Must-fix',
      category: 'Compatibility',
      text: 'First line of finding 1.\n\nSecond paragraph of finding 1.'
    }, 0 ) ).toBe( [
      '1. **Must-fix** (Compatibility): First line of finding 1.',
      '',
      '   Second paragraph of finding 1.'
    ].join( '\n' ) );
  } );

  it( 'widens indent for double-digit indices', () => {
    expect( formatFinding( {
      severity: 'Nice-to-have',
      category: 'Tests',
      text: 'Lead.\nMore.'
    }, 9 ) ).toBe( [
      '10. **Nice-to-have** (Tests): Lead.',
      '    More.'
    ].join( '\n' ) );
  } );

  it( 'returns only the header when text is empty', () => {
    expect( formatFinding( { severity: 'Nice-to-have', category: 'Design', text: '  ' }, 0 ) )
      .toBe( '1. **Nice-to-have** (Design)' );
  } );
} );

describe( 'sortFindings()', () => {
  it( 'orders Must-fix before Nice-to-have and keeps relative order within a severity', () => {
    const sorted = sortFindings( [
      { severity: 'Nice-to-have', category: 'Quality', text: 'a' },
      { severity: 'Must-fix', category: 'Correctness', text: 'b' },
      { severity: 'Nice-to-have', category: 'Tests', text: 'c' },
      { severity: 'Must-fix', category: 'Compatibility', text: 'd' }
    ] );

    expect( sorted.map( f => f.text ) ).toEqual( [ 'b', 'd', 'a', 'c' ] );
  } );
} );

describe( 'renderReviewMarkdown()', () => {
  it( 'renders verdict, spaced findings, and category scorecard', () => {
    const markdown = renderReviewMarkdown( {
      verdict: 'PASS',
      findings: [
        {
          severity: 'Nice-to-have',
          category: 'Documentation',
          text: 'First finding.\n\nMore detail.'
        },
        {
          severity: 'Must-fix',
          category: 'Compatibility',
          text: 'Blocking issue.'
        }
      ],
      categories: {
        Design: 'PASS',
        Quality: 'PASS',
        Correctness: 'PASS',
        Documentation: 'PASS',
        Changeset: 'PASS',
        Tests: 'PASS',
        Security: 'PASS',
        Compatibility: 'FAIL'
      }
    } );

    expect( markdown ).toContain( '### Verdict\n✅ PASS\n' );
    expect( markdown ).toContain( [
      '### Findings',
      '1. **Must-fix** (Compatibility): Blocking issue.',
      '',
      '2. **Nice-to-have** (Documentation): First finding.',
      '',
      '   More detail.',
      '',
      '### Categories'
    ].join( '\n' ) );
    expect( markdown ).toContain( '- Compatibility: ⛔ FAIL' );
    expect( CATEGORIES.every( name => markdown.includes( `- ${name}:` ) ) ).toBe( true );
  } );

  it( 'renders None. when there are no findings', () => {
    const markdown = renderReviewMarkdown( {
      verdict: 'PASS',
      findings: [],
      categories: Object.fromEntries( CATEGORIES.map( name => [ name, 'PASS' ] ) )
    } );

    expect( markdown ).toContain( '### Findings\nNone.\n' );
    expect( icon( 'PASS' ) ).toBe( '✅ PASS' );
    expect( icon( 'FAIL' ) ).toBe( '⛔ FAIL' );
  } );
} );
