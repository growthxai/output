import matter from 'gray-matter';
import { FatalError } from '@outputai/core';
import { tokenizeBlocks } from './blocks.js';

export function parsePrompt( { name, raw } ) {
  const { data: config, content } = matter( raw );

  if ( !content || content.trim() === '' ) {
    throw new FatalError( `Prompt "${name}" has no content after frontmatter` );
  }

  const messages = tokenizeBlocks( content );
  const instructions = messages.length === 0 ? content.trim() : null;

  return { config, messages, instructions };
}
