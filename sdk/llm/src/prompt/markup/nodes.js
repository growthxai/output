import { isOpeningTag, isClosingTag, isEmptyText, isSelfClosingTag, isComment, extractTag } from './tokens.js' ;
import { tokenize } from './tokenizer.js';
import { ValidationError } from '@outputai/core';

class Node {
  constructor( tagName, attributes, content = '' ) {
    this.tagName = tagName;
    this.attributes = attributes;
    this.content = content;
  }
}

export const parseMarkup = content => {
  const tokens = tokenize( content );
  if ( !tokens ) {
    return [];
  }

  const state = {
    currentNode: null
  };

  const nodes = [];

  // If the first ever valid text isnt a markup or comment, don't try to parse and return no nodes
  const firstContentToken = tokens.find( token => !isComment( token ) && !isEmptyText( token ) );
  if ( firstContentToken && !isOpeningTag( firstContentToken ) && !isClosingTag( firstContentToken ) && !isSelfClosingTag( firstContentToken ) ) {
    return [];
  }

  for ( const token of tokens ) {
    if ( isOpeningTag( token ) ) {
      const { tagName, attributes } = extractTag( token );
      if ( !state.currentNode ) {
        state.currentNode = new Node( tagName, attributes );
      } else {
        if ( tagName === state.currentNode.tagName ) {
          throw new ValidationError(
            `Invalid child tag: <${tagName}> cannot appear inside another <${tagName}>. Escape it as "&lt;${tagName}&gt;".`
          );
        }
        state.currentNode.content += token;
      }
    } else if ( isClosingTag( token ) ) {
      if ( !state.currentNode ) {
        throw new ValidationError( `Invalid root tag: closing tag "${token}" has no matching opening tag.` );
      }
      if ( extractTag( token ).tagName === state.currentNode.tagName ) {
        nodes.push( state.currentNode );
        state.currentNode = null;
      } else {
        state.currentNode.content += token;
      }
    } else {
      if ( state.currentNode ) {
        state.currentNode.content += token;
      } else {
        if ( isSelfClosingTag( token ) ) {
          throw new ValidationError( `Invalid root tag: self-closing tag "${token}" is not allowed.` );
        } else if ( !isComment( token ) && !isEmptyText( token ) ) {
          throw new ValidationError( 'Invalid root text: text is not allowed outside message tags.' );
        }
      }
    }
  }

  if ( state.currentNode ) {
    throw new ValidationError( `Invalid tag: <${state.currentNode.tagName}> is missing its closing tag.` );
  }
  return nodes;
};
