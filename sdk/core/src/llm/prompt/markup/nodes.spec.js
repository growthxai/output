import { describe, expect, it } from 'vitest';
import { parseMarkup } from './nodes.js';

const blocks = content =>
  parseMarkup( content ).map( ( { tagName, content: blockContent } ) => ( {
    tagName,
    content: blockContent
  } ) );

describe( 'parseMarkup', () => {
  describe( 'top-level blocks', () => {
    it( 'parses one generic block', () => {
      expect( blocks( '<user>Hello</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Hello' }
      ] );
    } );

    it( 'parses multiple sibling blocks', () => {
      expect( blocks( '<system>Rules</system>\n\n<user>Question</user>' ) ).toEqual( [
        { tagName: 'system', content: 'Rules' },
        { tagName: 'user', content: 'Question' }
      ] );
    } );

    it( 'supports generic and hyphenated tag names', () => {
      expect( blocks( '<custom-block>Value</custom-block>' ) ).toEqual( [
        { tagName: 'custom-block', content: 'Value' }
      ] );
    } );

    it( 'matches tag names case-insensitively', () => {
      expect( blocks( '<User>Hello</USER>' ) ).toEqual( [
        { tagName: 'user', content: 'Hello' }
      ] );
    } );

    it( 'parses an empty block', () => {
      expect( blocks( '<user></user>' ) ).toEqual( [
        { tagName: 'user', content: '' }
      ] );
    } );

    it( 'rejects a top-level self-closing block', () => {
      expect( () => parseMarkup( '<user />' ) )
        .toThrow( /^Invalid root tag: self-closing tag "<user \/>" is not allowed\.$/ );
    } );

    it( 'returns no blocks for empty content', () => {
      expect( parseMarkup( '' ) ).toEqual( [] );
    } );

    it( 'returns no blocks for plain text', () => {
      expect( parseMarkup( 'Generate a cinematic poster.' ) ).toEqual( [] );
    } );

    it( 'returns no blocks for text mixed with whitespace and comments', () => {
      expect( parseMarkup( '<!-- before -->\nGenerate a poster.\n<!-- after -->' ) ).toEqual( [] );
    } );

    it( 'returns no blocks when text precedes otherwise valid markup', () => {
      expect( parseMarkup( 'Note\n<user>Hello</user>\nTail' ) ).toEqual( [] );
    } );

    it( 'uses the first meaningful token after leading comments', () => {
      expect( parseMarkup( '<!-- note -->\nExplain <user>Hello</user> literally.' ) ).toEqual( [] );
    } );

    it( 'does not validate later tag-shaped content after instruction mode starts', () => {
      expect( parseMarkup( 'Explain </user>, <image />, and <user> examples.' ) ).toEqual( [] );
    } );

    it( 'returns no blocks for tag-shaped text that is not a valid tag', () => {
      expect( parseMarkup( 'Use a<b, b>c, and c < d.' ) ).toEqual( [] );
    } );

    it( 'treats an unterminated comment marker as plain text', () => {
      expect( parseMarkup( '<!-- unfinished' ) ).toEqual( [] );
    } );

    it( 'returns no blocks for whitespace and comments only', () => {
      expect( parseMarkup( '\n<!-- first -->\n<!-- second\nnote -->\n' ) ).toEqual( [] );
    } );

    it( 'ignores surrounding whitespace and comments', () => {
      expect( blocks( '<!-- prompt note -->\n\n<user>Hello</user>\n' ) ).toEqual( [
        { tagName: 'user', content: 'Hello' }
      ] );
    } );

    it( 'ignores multiline comments outside blocks', () => {
      expect( blocks( '<!-- prompt\nnote -->\n<user>Hello</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Hello' }
      ] );
    } );

    it( 'ignores comments before, between, and after blocks', () => {
      expect( blocks(
        '<!-- before --><system>Rules</system><!-- between --><user>Question</user><!-- after -->'
      ) ).toEqual( [
        { tagName: 'system', content: 'Rules' },
        { tagName: 'user', content: 'Question' }
      ] );
    } );

    it( 'supports whitespace inside a closing tag', () => {
      expect( blocks( '<user>Hello</ user >' ) ).toEqual( [
        { tagName: 'user', content: 'Hello' }
      ] );
    } );
  } );

  describe( 'opaque block content', () => {
    it( 'preserves a closed nested tag with a different name', () => {
      expect( blocks( '<user>Use <title>Example</title> here.</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Use <title>Example</title> here.' }
      ] );
    } );

    it( 'preserves an open nested tag with a different name', () => {
      expect( blocks( '<user>Use the <title> tag here.</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Use the <title> tag here.' }
      ] );
    } );

    it( 'preserves several unclosed nested tags with different names', () => {
      expect( blocks( '<user><article>Use <title>Example.</user>' ) ).toEqual( [
        { tagName: 'user', content: '<article>Use <title>Example.' }
      ] );
    } );

    it( 'preserves a nested tag matching another supported role', () => {
      expect( blocks( '<user>Describe the <system> tag.</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Describe the <system> tag.' }
      ] );
    } );

    it( 'preserves angle-bracket TypeScript syntax', () => {
      expect( blocks( '<user>Explain Array<string> and Promise<Result>.</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Explain Array<string> and Promise<Result>.' }
      ] );
    } );

    it( 'preserves unmatched angle brackets in text', () => {
      expect( blocks( '<user>Use a<b, b>c, c < d and d > e.</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Use a<b, b>c, c < d and d > e.' }
      ] );
    } );

    it( 'preserves a different unmatched closing tag', () => {
      expect( blocks( '<user>Show </title> literally.</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Show </title> literally.' }
      ] );
    } );

    it( 'preserves comments inside a block', () => {
      expect( blocks( '<user>Before<!-- hidden > note -->After</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Before<!-- hidden > note -->After' }
      ] );
    } );

    it( 'preserves multiline comments inside a block', () => {
      expect( blocks( '<user>Before<!-- hidden\nnote -->After</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Before<!-- hidden\nnote -->After' }
      ] );
    } );

    it( 'preserves a closing-tag-shaped value inside a comment', () => {
      expect( blocks( '<user>Before<!-- </user> -->After</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Before<!-- </user> -->After' }
      ] );
    } );

    it( 'preserves empty comments inside a block', () => {
      expect( blocks( '<user>Before<!---->After</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Before<!---->After' }
      ] );
    } );

    it( 'preserves whitespace, line endings, and Unicode content exactly', () => {
      expect( blocks( '<user>\r\n  Olá 👋\t \r\n</user>' ) ).toEqual( [
        { tagName: 'user', content: '\r\n  Olá 👋\t \r\n' }
      ] );
    } );

    it( 'preserves self-closing tags inside a block', () => {
      expect( blocks( '<user>Before<image source="avatar.png" />After</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Before<image source="avatar.png" />After' }
      ] );
    } );

    it( 'preserves a self-closing tag matching the block name', () => {
      expect( blocks( '<user>Write <user /> literally.</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Write <user /> literally.' }
      ] );
    } );

    it( 'allows escaped same-name tags as text', () => {
      expect( blocks( '<user>Use &lt;user&gt; and &lt;/user&gt;.</user>' ) ).toEqual( [
        { tagName: 'user', content: 'Use &lt;user&gt; and &lt;/user&gt;.' }
      ] );
    } );

  } );

  describe( 'attributes', () => {
    it( 'parses quoted, unquoted, and boolean attributes', () => {
      const [ node ] = parseMarkup( '<user options="cached" mode=fast pinned>Hello</user>' );

      expect( node.attributes ).toEqual( {
        options: 'cached',
        mode: 'fast',
        pinned: true
      } );
    } );

    it( 'supports whitespace around attribute equals signs', () => {
      const [ node ] = parseMarkup( '<user options = "cached shared" mode = fast pinned>Hello</user>' );

      expect( node.attributes ).toEqual( {
        options: 'cached shared',
        mode: 'fast',
        pinned: true
      } );
    } );

    it( 'lowercases attribute names and preserves values as strings', () => {
      const [ node ] = parseMarkup( '<user ENABLED=false COUNT=001 RATIO=1.25>Hello</user>' );

      expect( node.attributes ).toEqual( {
        enabled: 'false',
        count: '001',
        ratio: '1.25'
      } );
    } );

    it( 'parses empty explicit attribute values', () => {
      const [ node ] = parseMarkup( '<user first="" second=\'\' third=>Hello</user>' );

      expect( node.attributes ).toEqual( {
        first: '',
        second: '',
        third: ''
      } );
    } );

    it( 'allows the opposite quote type inside quoted values', () => {
      const [ node ] = parseMarkup( '<user single="it\'s ready" double=\'say "ready"\'>Hello</user>' );

      expect( node.attributes ).toEqual( {
        single: 'it\'s ready',
        double: 'say "ready"'
      } );
    } );

    it( 'allows greater-than characters inside double-quoted attributes', () => {
      const [ node ] = parseMarkup( '<user condition="score > 10">Hello</user>' );

      expect( node.attributes ).toEqual( { condition: 'score > 10' } );
      expect( node.content ).toBe( 'Hello' );
    } );

    it( 'allows greater-than characters inside single-quoted attributes', () => {
      const [ node ] = parseMarkup( '<user condition=\'score > 10\'>Hello</user>' );

      expect( node.attributes ).toEqual( { condition: 'score > 10' } );
      expect( node.content ).toBe( 'Hello' );
    } );

    it( 'rejects on single-quoted attributes missing end quote', () => {
      expect( () => parseMarkup( '<user color=\'red>Hello</user>' ) ).toThrow();
    } );

    it( 'rejects on double-quoted attributes missing end quote', () => {
      expect( () => parseMarkup( '<user color="red>Hello</user>' ) ).toThrow();
    } );

    it( 'rejects attributes closed by a different quote type', () => {
      expect( () => parseMarkup( '<user color=\'red">Hello</user>' ) ).toThrow();
      expect( () => parseMarkup( '<user color="red\'>Hello</user>' ) ).toThrow();
    } );

    it( 'rejects stray quotes in unquoted attribute values', () => {
      expect( () => parseMarkup( '<user color=red\'>Hello</user>' ) ).toThrow();
      expect( () => parseMarkup( '<user color=red">Hello</user>' ) ).toThrow();
    } );
  } );

  describe( 'invalid markup', () => {
    it( 'rejects a closed nested tag with the same name', () => {
      expect( () => parseMarkup( '<user>Outer <user>Inner</user> tail</user>' ) )
        .toThrow( /^Invalid child tag: <user> cannot appear inside another <user>\. Escape it as "&lt;user&gt;"\.$/ );
    } );

    it( 'rejects an open nested tag with the same name', () => {
      expect( () => parseMarkup( '<user>Use the <user> tag.</user>' ) ).toThrow();
    } );

    it( 'rejects a same-name nested tag with different casing', () => {
      expect( () => parseMarkup( '<User>Use the <user> tag.</USER>' ) ).toThrow();
    } );

    it( 'rejects a missing top-level closing tag', () => {
      expect( () => parseMarkup( '<user>Hello' ) )
        .toThrow( /^Invalid tag: <user> is missing its closing tag\.$/ );
    } );

    it( 'rejects a mismatched top-level closing tag', () => {
      expect( () => parseMarkup( '<user>Hello</system>' ) ).toThrow();
    } );

    it( 'rejects an unmatched closing tag outside a block', () => {
      expect( () => parseMarkup( '</user>' ) )
        .toThrow( /^Invalid root tag: closing tag "<\/user>" has no matching opening tag\.$/ );
    } );

    it( 'treats non-whitespace text before a block as instruction mode', () => {
      expect( parseMarkup( 'Prefix <user>Hello</user>' ) ).toEqual( [] );
    } );

    it( 'rejects non-whitespace text between blocks', () => {
      expect( () => parseMarkup( '<system>Rules</system> stray <user>Hello</user>' ) ).toThrow();
    } );

    it( 'rejects non-whitespace text after a block', () => {
      expect( () => parseMarkup( '<user>Hello</user> suffix' ) ).toThrow();
    } );

    it( 'rejects root text immediately after markup mode starts', () => {
      expect( () => parseMarkup( '<system>Rules</system> stray <user>Hello' ) )
        .toThrow( /^Invalid root text: text is not allowed outside message tags\.$/ );
    } );
  } );
} );
