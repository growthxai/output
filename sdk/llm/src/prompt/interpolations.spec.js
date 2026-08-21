import { describe, it, expect } from 'vitest';
import { decode, encode, interpolationFilterToken, pipeInterpolations } from './interpolations.js';

describe( 'encode', () => {
  it( 'encodes XML special characters', () => {
    expect( encode( '<a & b>' ) ).toBe( '&lt;a &amp; b&gt;' );
  } );

  it( 'encodes a tag-shaped substring so extractMessages cannot match it', () => {
    expect( encode( '<system>x</system>' ) ).toBe( '&lt;system&gt;x&lt;/system&gt;' );
  } );

  it( 'returns an empty string for null and undefined', () => {
    expect( encode( null ) ).toBe( '' );
    expect( encode( undefined ) ).toBe( '' );
  } );

  it( 'coerces numbers and booleans to string', () => {
    expect( encode( 42 ) ).toBe( '42' );
    expect( encode( true ) ).toBe( 'true' );
  } );

  it( 'passes empty and plain strings through unchanged', () => {
    expect( encode( '' ) ).toBe( '' );
    expect( encode( 'hello world' ) ).toBe( 'hello world' );
  } );
} );

describe( 'pipeInterpolations', () => {
  const piped = expr => `{{ ${expr} | ${interpolationFilterToken} }}`;

  it( 'appends the safety filter to a single interpolation', () => {
    expect( pipeInterpolations( '{{ name }}' ) ).toBe( piped( 'name' ) );
  } );

  it( 'appends the safety filter to every interpolation', () => {
    expect( pipeInterpolations( '{{ a }} and {{ b }}' ) ).toBe(
      `${piped( 'a' )} and ${piped( 'b' )}`
    );
  } );

  it( 'appends the safety filter last in an existing filter chain', () => {
    expect( pipeInterpolations( '{{ x | upcase }}' ) ).toBe( piped( 'x | upcase' ) );
    expect( pipeInterpolations( '{{ x | a | b }}' ) ).toBe( piped( 'x | a | b' ) );
  } );

  it( 'handles dotted property paths', () => {
    expect( pipeInterpolations( '{{ obj.field }}' ) ).toBe( piped( 'obj.field' ) );
  } );

  it( 'preserves a {% raw %} block even when it contains {{ ... }}', () => {
    const input = '{% raw %}{{ literal }}{% endraw %}';
    expect( pipeInterpolations( input ) ).toBe( input );
  } );

  it( 'rewrites interpolations outside a raw block while preserving the raw block', () => {
    expect( pipeInterpolations( '{{ a }}{% raw %}{{ b }}{% endraw %}{{ c }}' ) ).toBe(
      `${piped( 'a' )}{% raw %}{{ b }}{% endraw %}${piped( 'c' )}`
    );
  } );

  it( 'leaves control tags untouched and still pipes interpolations inside them', () => {
    expect( pipeInterpolations( '{% if cond %}{{ x }}{% endif %}' ) ).toBe(
      `{% if cond %}${piped( 'x' )}{% endif %}`
    );
    expect( pipeInterpolations( '{% for x in xs %}{{ x }}{% endfor %}' ) ).toBe(
      `{% for x in xs %}${piped( 'x' )}{% endfor %}`
    );
  } );

  it( 'normalizes interior whitespace', () => {
    expect( pipeInterpolations( '{{x}}' ) ).toBe( piped( 'x' ) );
    expect( pipeInterpolations( '{{   x   }}' ) ).toBe( piped( 'x' ) );
  } );

  it( 'returns the input unchanged when there are no interpolations', () => {
    expect( pipeInterpolations( '<user>plain text</user>' ) ).toBe( '<user>plain text</user>' );
    expect( pipeInterpolations( '' ) ).toBe( '' );
  } );
} );

describe( 'decode', () => {
  it( 'decodes XML entities in a string', () => {
    expect( decode( 'R&amp;D &lt; Speed &gt; &quot;Limits&quot;' ) ).toBe( 'R&D < Speed > "Limits"' );
  } );

  it( 'decodes XML entities recursively in arrays and plain objects', () => {
    expect( decode( {
      label: 'R&amp;D',
      values: [ 'A &lt; B' ],
      nested: {
        title: '&quot;Race&quot;'
      }
    } ) ).toEqual( {
      label: 'R&D',
      values: [ 'A < B' ],
      nested: {
        title: '"Race"'
      }
    } );
  } );

  it( 'returns non-string scalar values unchanged', () => {
    expect( decode( null ) ).toBeNull();
    expect( decode( undefined ) ).toBeUndefined();
    expect( decode( 42 ) ).toBe( 42 );
    expect( decode( true ) ).toBe( true );
  } );
} );
