import { encodeXML, decodeXML } from 'entities';

export const interpolationFilterToken = '__var_safe';

/**
 * XML-escapes a value.
 * @param {unknown} value - Any value to escape
 * @returns {string} Escaped value or '' if original value was null/undefined
 */
export const encode = value => [ null, undefined ].includes( value ) ? '' : encodeXML( String( value ) );

/**
 * Matches {% raw %}...{% endraw %} or {{ ... }} tags
 */
const VAR_OR_RAW = /(\{%\s*raw\s*%\}[\s\S]*?\{%\s*endraw\s*%\})|\{\{\s*([\s\S]+?)\s*\}\}/g;

/**
 * Appends `| __var_safe` filter to every `{{ ... }}` expression.
 *
 * The filter XML-escape the interpolated content so it cannot be parsed as new message blocks.
 *
 * Without this, a variable whose value contains `<system>` or `</user>` would inject extra
 * message blocks.
 *
 * Raw regions `{% raw %} ... {% endraw %}` are emitted verbatim by Liquid and preserved
 * unchanged.
 *
 * Note: The `g` flag advances past any matched raw regions, so `{{ ... }}` inside them are
 * preserved as well.
 *
 * @param {string} raw - Raw template string
 * @returns {string} Template with `| __var_safe` appended to each interpolation
 */
export const pipeInterpolations = raw =>
  raw.replace( VAR_OR_RAW, ( _, rawRegion, expressionContent ) =>
    rawRegion === undefined ? `{{ ${expressionContent.trim()} | ${interpolationFilterToken} }}` : rawRegion
  );

/**
 * Just decode a XML-encoded string.
 * @param {string} value - Value to decode
 * @returns {unknown} Decoded value
 */
export const decode = value => decodeXML( value );
