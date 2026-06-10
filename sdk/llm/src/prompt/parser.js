import matter from 'gray-matter';
import { FatalError } from '@outputai/core';

const BLOCK_EXTRACTOR = /<(system|user|assistant|tool)(\s[^>]*)?>([\s\S]*?)<\/\1>/gm;

/**
 * Parse optional attributes on a role block's opening tag into authoring helpers:
 * - `cache` / `cache="1h"` → Anthropic prompt-cache breakpoint shorthand
 * - `options="set_a set_b"` → references to frontmatter `messageOptions` sets
 */
const parseBlockAttributes = ( attrs = '' ) => {
  const result = {};

  const cache = attrs.match( /(?:^|\s)cache(?:=["']?([^"'\s]+)["']?)?(?=\s|$)/ );
  if ( cache ) {
    result.cache = cache[1] ?? true;
  }

  const options = attrs.match( /\boptions=["']([^"']+)["']/ );
  if ( options ) {
    result.options = options[1].trim().split( /\s+/ );
  }

  return result;
};

export function parsePrompt( { name, raw } ) {
  const { data: config, content } = matter( raw );

  if ( !content || content.trim() === '' ) {
    throw new FatalError( `Prompt "${name}" has no content after frontmatter` );
  }

  const messages = [ ...content.matchAll( BLOCK_EXTRACTOR ) ].map(
    ( [ _, role, attrs, text ] ) => ( {
      role,
      content: text.trim(),
      ...parseBlockAttributes( attrs )
    } )
  );

  const instructions = messages.length === 0 ? content.trim() : null;

  return { config, messages, instructions };
}
