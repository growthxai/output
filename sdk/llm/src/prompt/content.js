import { Role } from '../consts.js';
import { decode } from './interpolations.js';
import { parse } from 'node-html-parser';
import { FatalError } from '@outputai/core';

/** Merge two objects 2-level deep. */
const mergeOptions = ( base = {}, extra = {} ) => {
  const merged = { ...base };
  for ( const [ namespace, options ] of Object.entries( extra ) ) {
    merged[namespace] = { ...merged[namespace], ...options };
  }
  return merged;
};

/** Takes an object and converts all its root level keys to lowercase */
const convertRootKeysToLowerCase = v => Object.fromEntries( Object.entries( v ).map( e => [ e[0].toLowerCase(), e[1] ] ) );

/** Gets the options attribute from the message attributes */
const extractOptions = rawAttributes => {
  const attributes = convertRootKeysToLowerCase( rawAttributes );
  const rawOptions = attributes.options?.trim();
  delete attributes.options;
  if ( Object.keys( attributes ).length > 0 ) {
    throw new FatalError( 'Message has unsupported attributes. The only supported attribute is "options".' );
  }
  return rawOptions ? rawOptions.split( /\s+/ ) : null;
};

/** Merge down messageOptions selected from a list */
const resolveProviderOptions = ( options, messageOptions ) =>
  options.reduce( ( result, option ) => {
    if ( !messageOptions[option] ) {
      throw new FatalError( `Message "options" attribute references unknown option "${option}" in \`config.messageOptions\`.` );
    }
    return mergeOptions( result, messageOptions[option] );
  }, {} );

/**
 * Extract messages or instructions from prompt content. Role tags yield messages
 * and null instructions; otherwise instructions are the decoded body.
 */
export const parseContent = ( content, messageOptions ) => {
  const root = parse( content );
  const roles = Object.values( Role );

  const messageNodes = [ ...root.children ]
    .filter( node => roles.includes( node.tagName.toLowerCase() ) );

  if ( messageNodes.length === 0 ) {
    return {
      messages: [],
      instructions: decode( content.trim() )
    };
  }

  return {
    messages: messageNodes.map( node => {
      const options = extractOptions( node.attributes );
      if ( options && Object.keys( messageOptions ?? {} ).length === 0 ) {
        throw new FatalError( 'Message has "options" attribute but `config.messageOptions` is empty.' );
      }
      const providerOptions = options ? resolveProviderOptions( options, messageOptions ) : null;
      return {
        role: node.tagName.toLowerCase(),
        content: decode( node.innerHTML.trim() ),
        ...( providerOptions && { providerOptions } )
      };
    } ),
    instructions: null
  };
};
