import { Role } from '../consts.js';
import { decode } from './interpolations.js';

/**
 * @typedef PromptMessage
 * @property {string} role
 * @property {string} content
 * @property {Record<string, string | true>} [attributes]
 */

const roles = new Set( Object.values( Role ) );

const TAG_PATTERN = new RegExp(
  `<(${[ ...roles ].join( '|' )})((?:\\s[^>]*)?)>([\\s\\S]*?)<\\/\\1>`,
  'gm'
);

const ATTRIBUTE_PATTERN = /([a-zA-Z][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

/**
 * Parse a raw opening-tag attribute string into a plain object. Supports bare booleans
 * (`cache`), double/single-quoted values, and unquoted values:
 * `cache options="a b" ttl='1h'` -> `{ cache: true, options: 'a b', ttl: '1h' }`.
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
 * Extract messages from the tags inside a prompt content.
 * The `attributes` are attributes extracted from the opening tag (like HTML).
 * Content between role tags is treated as opaque text, so prompt bodies may freely contain other angle-bracket markup.
 *
 * @param {string} content - Rendered prompt body (after frontmatter is stripped)
 * @returns {PromptMessage[]}
 */
export const extractMessages = content =>
  [ ...content.matchAll( TAG_PATTERN ) ].map( ( [ _, role, rawAttributes, text ] ) => {
    const attributes = parseAttributes( rawAttributes.trim() );
    return {
      role,
      content: decode( text.trim() ),
      ...( Object.keys( attributes ).length > 0 && { attributes } )
    };
  } );

/**
 * Extract messages or instructions from prompt content. Role tags yield messages
 * and null instructions; otherwise instructions are the decoded body.
 *
 * @param {string} content - Rendered prompt body (after frontmatter is stripped)
 * @returns {{ messages: PromptMessage[], instructions: string | null }}
 */
export const parseContent = content => {
  const messages = extractMessages( content );
  return {
    messages,
    instructions: messages.length === 0 ? decode( content ) : null
  };
};
