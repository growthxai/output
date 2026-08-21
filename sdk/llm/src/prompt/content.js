import { Role } from '../consts.js';
import { decode } from './interpolations.js';
import { FatalError } from '@outputai/core';
import { parseMarkup } from './markup/nodes.js';

/** Merge two objects 2-level deep. */
const mergeOptions = ( base = {}, extra = {} ) => {
  const merged = { ...base };
  for ( const [ namespace, options ] of Object.entries( extra ) ) {
    merged[namespace] = { ...merged[namespace], ...options };
  }
  return merged;
};

/** Gets the options attribute from the message attributes */
const extractOptions = attributes => {
  const { options, ...unsupportedAttributes } = attributes;
  if ( Object.keys( unsupportedAttributes ).length > 0 ) {
    throw new FatalError( 'Message has unsupported attributes. The only supported attribute is "options".' );
  }
  if ( options === true ) {
    throw new FatalError( 'Message "options" attribute must have a value.' );
  }
  const rawOptions = options?.trim();
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

const promptRoleSet = new Set( [ Role.SYSTEM, Role.USER, Role.ASSISTANT ] );

/**
 * Extract messages or instructions from prompt content. A leading role tag yields
 * messages and null instructions; otherwise instructions are the decoded body.
 */
export const parseContent = ( content, messageOptions ) => {
  const nodes = parseMarkup( content );

  if ( nodes.length === 0 ) {
    return { messages: [], instructions: decode( content.trim() ) };
  }

  const invalidRole = nodes.find( node => !promptRoleSet.has( node.tagName ) );
  if ( invalidRole ) {
    throw new FatalError( `Message has invalid role "${invalidRole.tagName}".` );
  }

  return {
    messages: nodes.map( node => {
      const options = extractOptions( node.attributes );
      if ( options && Object.keys( messageOptions ?? {} ).length === 0 ) {
        throw new FatalError( 'Message has "options" attribute but `config.messageOptions` is empty.' );
      }
      const providerOptions = options ? resolveProviderOptions( options, messageOptions ) : null;
      return {
        role: node.tagName.toLowerCase(),
        content: decode( node.content.trim() ),
        ...( providerOptions && { providerOptions } )
      };
    } ),
    instructions: null
  };
};
