import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenizer.js';

describe( 'tokenize', () => {
  it( 'returns null for empty input', () => {
    expect( tokenize( '' ) ).toBeNull();
  } );

  it( 'returns plain text as one token', () => {
    expect( tokenize( 'plain text' ) ).toEqual( [ 'plain text' ] );
  } );

  it( 'separates opening tags, content, and closing tags', () => {
    expect( tokenize( '<user>Hello</user>' ) ).toEqual( [
      '<user>',
      'Hello',
      '</user>'
    ] );
  } );

  it( 'tokenizes multiple sibling blocks and their whitespace', () => {
    expect( tokenize( '<system>Rules</system>\n\n<user>Question</user>' ) ).toEqual( [
      '<system>',
      'Rules',
      '</system>',
      '\n\n',
      '<user>',
      'Question',
      '</user>'
    ] );
  } );

  it( 'keeps opening tags with attributes intact', () => {
    expect( tokenize( '<user options="cached shared" mode=fast>Hello</user>' ) ).toEqual( [
      '<user options="cached shared" mode=fast>',
      'Hello',
      '</user>'
    ] );
  } );

  it( 'keeps greater-than characters inside quoted attributes', () => {
    expect( tokenize( '<user condition="score > 10">Hello</user>' ) ).toEqual( [
      '<user condition="score > 10">',
      'Hello',
      '</user>'
    ] );
  } );

  it( 'keeps self-closing tags intact', () => {
    expect( tokenize( '<user>Before<image source="avatar.png" />After</user>' ) ).toEqual( [
      '<user>',
      'Before',
      '<image source="avatar.png" />',
      'After',
      '</user>'
    ] );
  } );

  it( 'supports whitespace in closing tags', () => {
    expect( tokenize( '<user>Hello</ user >' ) ).toEqual( [
      '<user>',
      'Hello',
      '</ user >'
    ] );
  } );

  it( 'keeps single-line comments intact', () => {
    expect( tokenize( '<!-- note --><user>Hello</user>' ) ).toEqual( [
      '<!-- note -->',
      '<user>',
      'Hello',
      '</user>'
    ] );
  } );

  it( 'keeps multiline comments intact', () => {
    expect( tokenize( '<!-- first\nsecond --><user>Hello</user>' ) ).toEqual( [
      '<!-- first\nsecond -->',
      '<user>',
      'Hello',
      '</user>'
    ] );
  } );

  it( 'tokenizes adjacent comments separately', () => {
    expect( tokenize( '<!-- first --><!-- second -->' ) ).toEqual( [
      '<!-- first -->',
      '<!-- second -->'
    ] );
  } );

  it( 'preserves a lone less-than character', () => {
    expect( tokenize( '<' ) ).toEqual( [ '<' ] );
  } );

  it( 'preserves an unterminated comment losslessly', () => {
    const input = '<!-- unfinished';
    const tokens = tokenize( input );

    expect( tokens ).toEqual( [ '<', '!-- unfinished' ] );
    expect( tokens.join( '' ) ).toBe( input );
  } );

  it( 'keeps a tag with an unterminated attribute quote intact for later validation', () => {
    const input = '<user color=\'red>Hello</user>';

    expect( tokenize( input ) ).toEqual( [
      '<user color=\'red>',
      'Hello',
      '</user>'
    ] );
  } );

  it( 'preserves TypeScript angle-bracket syntax losslessly', () => {
    const input = 'Explain Array<string> and Promise<Result>.';

    expect( tokenize( input ).join( '' ) ).toBe( input );
  } );

  it( 'preserves comparison operators and tag-shaped text losslessly', () => {
    const input = 'Use 1<2, a<b, b>c, c < d, and d > e.';

    expect( tokenize( input ).join( '' ) ).toBe( input );
  } );

  it( 'preserves every character in mixed markup', () => {
    const input = '<!-- note -->\n<user condition="a > b">Use x<y and <title>.</user>';

    expect( tokenize( input ).join( '' ) ).toBe( input );
  } );

  it.each( [
    '',
    '<',
    '<<<user>',
    '<!-- first --><!-- second -->',
    '<!-- unfinished',
    '<user>Hello</user>',
    '<user />',
    '<user condition="score > 10">Hello</user>',
    '<user color=\'red>Hello</user>',
    '<user color=\'red">Hello</user>',
    '<b,b>',
    '<user>Use 1<2, a<b, and b>c.</user>',
    '<user>\r\nUnicode: Olá 👋\r\n</user>'
  ] )( 'is lossless for %s', input => {
    expect( ( tokenize( input ) ?? [] ).join( '' ) ).toBe( input );
  } );
} );
