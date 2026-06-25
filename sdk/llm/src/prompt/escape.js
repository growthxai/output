import { encodeXML, decodeXML } from 'entities';
import { Objects } from '@outputai/core/sdk/helpers';

const VAR_SAFE_FILTER = '__var_safe';

/**
 * XML-escapes a value.
 * @param {unknown} value - Any value to escape
 * @returns {string} Escaped value or '' if original value was null/undefined
 */
export const encodeFilter = value => [ null, undefined ].includes( value ) ? '' : encodeXML( String( value ) );

/**
 * Sets up the encoder filter on a Liquid instance.
 * @param {object} liquid - LiquidJS instance
 */
export const setupLiquidEncodeFilter = liquid => liquid.registerFilter( VAR_SAFE_FILTER, encodeFilter );

/**
 * Matches {% raw %}...{% endraw %} or {{ ... }} tags
 */
const VAR_OR_RAW = /(\{%\s*raw\s*%\}[\s\S]*?\{%\s*endraw\s*%\})|\{\{\s*([\s\S]+?)\s*\}\}/g;

/**
 * Escapes Liquid templates so rendered variable content cannot be parsed as message blocks.
 *
 * Appends `| __var_safe` to every `{{ ... }}` expression so variable output is XML-escaped
 * by the filter registered on Liquid before parsePrompt tokenizes message blocks.
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
 * @param {string} raw - Raw string value
 * @returns {string} Escaped string
 */
export const escape = raw =>
  raw.replace( VAR_OR_RAW, ( _, rawRegion, expressionContent ) =>
    rawRegion === undefined ? `{{ ${expressionContent.trim()} | ${VAR_SAFE_FILTER} }}` : rawRegion
  );

/**
 * Recursively XML-decodes a value.
 * @param {unknown} value - Value to decode
 * @returns {unknown} Decoded value
 */
export const decode = value => {
  if ( typeof value === 'string' ) {
    return decodeXML( value );
  }
  if ( Array.isArray( value ) ) {
    return value.map( decode );
  }
  if ( Objects.isPlainObject( value ) ) {
    return Object.fromEntries(
      Object.entries( value ).map( ( [ k, v ] ) => [ k, decode( v ) ] )
    );
  }
  return value;
};
