import { describe, it, expect } from 'vitest';
import { Liquid } from 'liquidjs';
import { decode, encodeFilter, escape, setupLiquidEncodeFilter } from './escape.js';

describe( 'encodeFilter', () => {
  it( 'encodes < to &lt;', () => {
    expect( encodeFilter( '<' ) ).toBe( '&lt;' );
  } );

  it( 'encodes > to &gt;', () => {
    expect( encodeFilter( '>' ) ).toBe( '&gt;' );
  } );

  it( 'encodes & to &amp;', () => {
    expect( encodeFilter( '&' ) ).toBe( '&amp;' );
  } );

  it( 'encodes a string with multiple special characters in one pass', () => {
    expect( encodeFilter( '<a & b>' ) ).toBe( '&lt;a &amp; b&gt;' );
  } );

  it( 'encodes a tag-shaped substring so the parser cannot tokenize it', () => {
    expect( encodeFilter( '<system>x</system>' ) ).toBe( '&lt;system&gt;x&lt;/system&gt;' );
  } );

  it( 'returns an empty string for null', () => {
    expect( encodeFilter( null ) ).toBe( '' );
  } );

  it( 'returns an empty string for undefined', () => {
    expect( encodeFilter( undefined ) ).toBe( '' );
  } );

  it( 'coerces numbers to string before encoding', () => {
    expect( encodeFilter( 42 ) ).toBe( '42' );
  } );

  it( 'coerces booleans to string before encoding', () => {
    expect( encodeFilter( true ) ).toBe( 'true' );
    expect( encodeFilter( false ) ).toBe( 'false' );
  } );

  it( 'passes empty strings through unchanged', () => {
    expect( encodeFilter( '' ) ).toBe( '' );
  } );

  it( 'passes plain text through unchanged', () => {
    expect( encodeFilter( 'hello world' ) ).toBe( 'hello world' );
  } );
} );

describe( 'setupLiquidEncodeFilter', () => {
  it( 'registers the safety filter on a Liquid instance', async () => {
    const liquid = new Liquid();

    setupLiquidEncodeFilter( liquid );

    await expect( liquid.parseAndRender( '{{ value | __var_safe }}', {
      value: '<system>x</system>'
    } ) ).resolves.toBe( '&lt;system&gt;x&lt;/system&gt;' );
  } );
} );

describe( 'escape', () => {
  it( 'rewrites a single {{ var }} to append the safety filter', () => {
    expect( escape( '{{ name }}' ) ).toBe( '{{ name | __var_safe }}' );
  } );

  it( 'rewrites multiple expressions in the same string', () => {
    expect( escape( '{{ a }} and {{ b }}' ) ).toBe(
      '{{ a | __var_safe }} and {{ b | __var_safe }}'
    );
  } );

  it( 'appends the safety filter last in an existing filter chain', () => {
    expect( escape( '{{ x | upcase }}' ) ).toBe(
      '{{ x | upcase | __var_safe }}'
    );
  } );

  it( 'handles longer filter chains', () => {
    expect( escape( '{{ x | a | b }}' ) ).toBe(
      '{{ x | a | b | __var_safe }}'
    );
  } );

  it( 'handles dotted property paths', () => {
    expect( escape( '{{ obj.field }}' ) ).toBe(
      '{{ obj.field | __var_safe }}'
    );
  } );

  it( 'preserves a {% raw %} block untouched even when it contains {{ ... }}', () => {
    const input = '{% raw %}{{ literal }}{% endraw %}';
    expect( escape( input ) ).toBe( input );
  } );

  it( 'rewrites {{ ... }} outside a raw block while preserving the raw block', () => {
    expect( escape( '{{ a }}{% raw %}{{ b }}{% endraw %}{{ c }}' ) ).toBe(
      '{{ a | __var_safe }}{% raw %}{{ b }}{% endraw %}{{ c | __var_safe }}'
    );
  } );

  it( 'leaves {% if %} control tags untouched but still arms {{ ... }} inside them', () => {
    expect( escape( '{% if cond %}{{ x }}{% endif %}' ) ).toBe(
      '{% if cond %}{{ x | __var_safe }}{% endif %}'
    );
  } );

  it( 'leaves {% for %} control tags untouched but still arms {{ ... }} inside them', () => {
    expect( escape( '{% for x in xs %}{{ x }}{% endfor %}' ) ).toBe(
      '{% for x in xs %}{{ x | __var_safe }}{% endfor %}'
    );
  } );

  it( 'normalizes interior whitespace via expressionContent.trim()', () => {
    expect( escape( '{{x}}' ) ).toBe( '{{ x | __var_safe }}' );
    expect( escape( '{{   x   }}' ) ).toBe( '{{ x | __var_safe }}' );
  } );

  it( 'returns the input unchanged when there are no {{ ... }} expressions', () => {
    expect( escape( '<user>plain text</user>' ) ).toBe(
      '<user>plain text</user>'
    );
  } );

  it( 'handles an empty string', () => {
    expect( escape( '' ) ).toBe( '' );
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
