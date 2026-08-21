import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractAttributes } from './attributes.js';
import {
  extractTag,
  isClosingTag,
  isComment,
  isEmptyText,
  isOpeningTag,
  isSelfClosingTag
} from './tokens.js';

vi.mock( './attributes.js', () => ( {
  extractAttributes: vi.fn()
} ) );

describe( 'extractTag', () => {
  beforeEach( () => {
    vi.mocked( extractAttributes ).mockReset().mockReturnValue( {} );
  } );

  it( 'extracts and lowercases an opening tag name', () => {
    expect( extractTag( '<User>' ) ).toEqual( {
      tagName: 'user',
      attributes: {}
    } );
    expect( extractAttributes ).not.toHaveBeenCalled();
  } );

  it( 'extracts a hyphenated tag name', () => {
    expect( extractTag( '<CUSTOM-BLOCK>' ) ).toEqual( {
      tagName: 'custom-block',
      attributes: {}
    } );
  } );

  it( 'extracts a closing tag name', () => {
    expect( extractTag( '</User>' ) ).toEqual( {
      tagName: 'user',
      attributes: {}
    } );
  } );

  it( 'supports whitespace inside closing tags', () => {
    expect( extractTag( '</ User >' ) ).toEqual( {
      tagName: 'user',
      attributes: {}
    } );
    expect( extractAttributes ).not.toHaveBeenCalled();
  } );

  it( 'delegates raw opening-tag attributes', () => {
    const attributes = { options: 'cached shared', pinned: true };
    vi.mocked( extractAttributes ).mockReturnValue( attributes );

    expect( extractTag( '<user options = "cached shared" pinned>' ) ).toEqual( {
      tagName: 'user',
      attributes
    } );
    expect( extractAttributes ).toHaveBeenCalledOnce();
    expect( extractAttributes ).toHaveBeenCalledWith( 'options = "cached shared" pinned' );
  } );

  it( 'propagates attribute parsing errors', () => {
    vi.mocked( extractAttributes ).mockImplementation( () => {
      throw new Error( 'invalid attributes' );
    } );

    expect( () => extractTag( '<user color="red>' ) ).toThrow( 'invalid attributes' );
  } );

  it( 'throws a descriptive error for a malformed token', () => {
    expect( () => extractTag( 'plain text' ) )
      .toThrow( /^Could not parse tag "plain text"\.$/ );
  } );
} );

describe( 'isOpeningTag', () => {
  it.each( [
    '<user>',
    '<user >',
    '<User options="cached">',
    '<custom-block mode=fast>',
    '<user\toptions=fast>',
    '<user\noptions="cached shared">',
    '<user condition="score > 10">',
    '<user color=\'red>'
  ] )( 'recognizes %s', token => {
    expect( isOpeningTag( token ) ).toBe( true );
  } );

  it.each( [
    '</user>',
    '< user>',
    '<>',
    '<,>',
    '<b,b>',
    '<b, b>',
    '<user,>',
    '<user=admin>',
    '<user.name>',
    '<1user>',
    '<_user>',
    '<üser>',
    '<user />',
    '<user/>',
    '<user options="cached" />',
    '<user / >',
    '<!-- note -->',
    '<!DOCTYPE html>',
    '<?xml version="1.0"?>',
    '<user',
    'user>',
    '<user></user>',
    '<user<other>>',
    '<user condition="a < b">',
    'plain text'
  ] )( 'rejects %s', token => {
    expect( isOpeningTag( token ) ).toBe( false );
  } );
} );

describe( 'isClosingTag', () => {
  it.each( [
    '</user>',
    '</User>',
    '</custom-block>',
    '</ user >',
    '</user   >',
    '</\tuser\t>',
    '</\nuser\n>'
  ] )( 'recognizes %s', token => {
    expect( isClosingTag( token ) ).toBe( true );
  } );

  it.each( [
    '<user>',
    '<user />',
    '<!-- note -->',
    '</>',
    '< /user>',
    '</user',
    '</user/>',
    '</user / >',
    '</user options=ignored>',
    '</b,b>',
    '</1user>',
    '</_user>',
    '</üser>',
    '</user> suffix',
    'prefix </user>',
    '</user></system>',
    '</user<system>>',
    'plain text'
  ] )( 'rejects %s', token => {
    expect( isClosingTag( token ) ).toBe( false );
  } );
} );

describe( 'isSelfClosingTag', () => {
  it.each( [
    '<user/>',
    '<user />',
    '<CUSTOM-BLOCK />',
    '<image source="avatar.png" />',
    '<user options = "cached shared" />',
    '<user condition="score > 10"/>',
    '<user\tmode=fast\t/>',
    '<user\nmode=fast\n/>',
    '<user / >',
    '<user color=\'red />'
  ] )( 'recognizes %s', token => {
    expect( isSelfClosingTag( token ) ).toBe( true );
  } );

  it.each( [
    '<user>',
    '</user>',
    '<!-- note -->',
    '< user/>',
    '<>',
    '<,/>',
    '<b,b/>',
    '<user,/>',
    '<1user/>',
    '<_user/>',
    '<üser/>',
    '</user/>',
    '<user/',
    '<user/> suffix',
    'prefix <user/>',
    '<user/><system/>',
    '<user<other>/>',
    '<!DOCTYPE html />',
    '<?xml version="1.0"?>',
    '<user path="/tmp">',
    '<user path="/" >',
    'plain text'
  ] )( 'rejects %s', token => {
    expect( isSelfClosingTag( token ) ).toBe( false );
  } );
} );

describe( 'isComment', () => {
  it.each( [
    '<!---->',
    '<!-- -->',
    '<!-- note -->',
    '<!-- first\nsecond -->',
    '<!-- <user>text</user> -->',
    '<!-- a > b and c < d -->'
  ] )( 'recognizes %s', token => {
    expect( isComment( token ) ).toBe( true );
  } );

  it.each( [
    '<!-->',
    '<! -- note -->',
    '<!-- unfinished',
    '<!-- note -- >',
    '<!-- note --!>',
    'prefix <!-- note -->',
    '<!-- note --> suffix',
    '<user><!-- note --></user>',
    '<!-- first --><!-- second -->',
    '<!-- first -->\n<!-- second -->',
    '<!-- -->text<!-- -->'
  ] )( 'rejects %s', token => {
    expect( isComment( token ) ).toBe( false );
  } );
} );

describe( 'isEmptyText', () => {
  it.each( [
    '',
    ' ',
    '\t',
    '\n\n',
    ' \n\t '
  ] )( 'recognizes whitespace-only text', token => {
    expect( isEmptyText( token ) ).toBe( true );
  } );

  it.each( [
    'text',
    ' text ',
    '<user>'
  ] )( 'rejects non-whitespace text', token => {
    expect( isEmptyText( token ) ).toBe( false );
  } );
} );
