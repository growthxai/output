import matter from 'gray-matter';
import { FatalError } from '@outputai/core';

export function parsePrompt( { name, raw } ) {
  const { data: config, content } = matter( raw );

  if ( !content || content.trim() === '' ) {
    throw new FatalError( `Prompt "${name}" has no content after frontmatter` );
  }

  const infoExtractor = /<(system|user|assistant|tool)>([\s\S]*?)<\/\1>/gm;
  const messages = [ ...content.matchAll( infoExtractor ) ].map(
    ( [ _, role, text ] ) => ( { role, content: text.trim() } )
  );

  const instructions = messages.length === 0 ? content.trim() : null;

  return { config, messages, instructions };
}
