import { ValidationError } from '@outputai/core';

const attributeSeparator = /(?<![=\s])\s+(?!\s*=)(?=(?:[^"']|"[^"]*"|'[^']*')*$)/;

export const extractAttributes = rawAttributes => {
  if ( !rawAttributes?.trim() ) {
    return {};
  }
  const pairs = rawAttributes.trim().split( attributeSeparator );
  const attributeKeyRule = /^[A-Za-z][\w-]*$/;

  return Object.fromEntries(
    pairs.map( p => {
      const splitIndex = p.indexOf( '=' );
      if ( splitIndex === -1 ) {
        const key = p.toLowerCase();
        if ( !attributeKeyRule.test( key ) ) {
          throw new ValidationError( `Invalid attribute name "${key}".` );
        }
        return [ key, true ];
      }

      const key = p.slice( 0, splitIndex ).trim().toLowerCase();
      if ( !key ) {
        throw new ValidationError( `Invalid attribute "${p}": name is missing.` );
      }
      if ( !attributeKeyRule.test( key ) ) {
        throw new ValidationError( `Invalid attribute name "${key}".` );
      }
      const value = p.slice( splitIndex + 1 ).trim();
      const openingQuote = value[0];
      const isQuoted = openingQuote === '\'' || openingQuote === '"';

      if ( !isQuoted ) {
        const invalidCharacter = value.match( /['"<>=]/ )?.[0];
        if ( invalidCharacter ) {
          throw new ValidationError( `Invalid attribute "${key}": unquoted value contains invalid character \`${invalidCharacter}\`.` );
        }
        return [ key, value ];
      } else {
        if ( value.at( -1 ) !== openingQuote ) {
          throw new ValidationError( `Invalid attribute "${key}": quoted value is missing its closing quote (${openingQuote}).` );
        }
        const unquoted = value.slice( 1, -1 );
        if ( unquoted.includes( openingQuote ) ) {
          throw new ValidationError( `Invalid attribute "${key}": quoted value contains an unexpected quote (${openingQuote}).` );
        }
        return [ key, unquoted ];
      }
    } )
  );
};
