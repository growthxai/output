import { ValidationError } from '@outputai/core';
import { extractAttributes } from './attributes.js';

export const extractTag = v => {
  const capture = v.match( /^<\/?\s*([\w-]+)(?:\s+(.+?))?\s*>$/ );
  if ( !capture ) {
    throw new ValidationError( `Could not parse tag "${v}".` );
  }
  const [ name, rawAttributes ] = capture.slice( 1, 3 );
  if ( !name ) {
    throw new ValidationError( `Could not parse tag "${v}".` );
  }
  return {
    tagName: name.toLowerCase(),
    attributes: rawAttributes ? extractAttributes( rawAttributes ) : {}
  };
};

const hasClosing = v => /\/\s*>$/.test( v );
const hasOpening = v => /^<[A-Za-z][\w-]*(?=\s|\/?>)[^<]*>$/.test( v );

export const isOpeningTag = v => hasOpening( v ) && !hasClosing( v );
export const isComment = v => v.startsWith( '<!--' ) && v.endsWith( '-->' ) && v.length >= 7 && !v.slice( 4, -3 ).includes( '-->' );
export const isSelfClosingTag = v => hasOpening( v ) && hasClosing( v );
export const isEmptyText = v => /^\s*$/.test( v );
export const isClosingTag = v => /^<\/\s*[A-Za-z]+[\w-]*\s*>$/.test( v );
