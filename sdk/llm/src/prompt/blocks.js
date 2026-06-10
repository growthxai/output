/**
 * Roles that introduce a message block. Add a role here to support a new
 * `<role>...</role>` block — the tokenizer pattern is derived from this set,
 * so no other parser change is required.
 */
export const BLOCK_ROLES = new Set( [ 'system', 'user', 'assistant', 'tool' ] );

const BLOCK_PATTERN = new RegExp(
  `<(${[ ...BLOCK_ROLES ].join( '|' )})((?:\\s[^>]*)?)>([\\s\\S]*?)<\\/\\1>`,
  'gm'
);

const ATTRIBUTE_PATTERN = /([a-zA-Z][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

/**
 * Parse a raw opening-tag attribute string into a plain object. Supports bare booleans
 * (`cache`), double/single-quoted values, and unquoted values:
 * `cache options="a b" ttl='1h'` → `{ cache: true, options: 'a b', ttl: '1h' }`.
 *
 * @param {string} [raw] - Raw attribute text between the role and the closing `>`
 * @returns {Record<string, string | true>} Parsed attributes
 */
export const parseAttributes = ( raw = '' ) =>
  Object.fromEntries(
    [ ...raw.matchAll( ATTRIBUTE_PATTERN ) ].map(
      ( [ _, key, doubleQuoted, singleQuoted, bare ] ) =>
        [ key, doubleQuoted ?? singleQuoted ?? bare ?? true ]
    )
  );

/**
 * Tokenize a rendered prompt body into message blocks. Each block is `{ role, content }`,
 * plus `attributes` when the opening tag carried any. Content between role tags is treated
 * as opaque text, so prompt bodies may freely contain other angle-bracket markup.
 *
 * @param {string} content - Rendered prompt body (after frontmatter is stripped)
 * @returns {Array<{ role: string, content: string, attributes?: Record<string, string | true> }>}
 */
export const tokenizeBlocks = content =>
  [ ...content.matchAll( BLOCK_PATTERN ) ].map( ( [ _, role, rawAttributes, text ] ) => {
    const attributes = parseAttributes( rawAttributes.trim() );
    return {
      role,
      content: text.trim(),
      ...( Object.keys( attributes ).length > 0 && { attributes } )
    };
  } );
