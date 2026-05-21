import matter from 'gray-matter';
import { FatalError } from '@outputai/core';

export function parsePrompt( raw ) {
  const { data: config, content } = matter( raw );

  if ( !content || content.trim() === '' ) {
    throw new FatalError( 'Prompt file has no content after frontmatter' );
  }

  const infoExtractor = /<(system|user|assistant|tool)>([\s\S]*?)<\/\1>/gm;
  const messages = [ ...content.matchAll( infoExtractor ) ].map(
    ( [ _, role, text ] ) => ( { role, content: text.trim() } )
  );

  if ( messages.length === 0 ) {
    const contentPreview = content.substring( 0, 200 );
    const ellipsis = content.length > 200 ? '...' : '';

    throw new FatalError(
      `No valid message blocks found in prompt file.
Expected format: <system>...</system>, <user>...</user>, etc.
Content preview: ${contentPreview}${ellipsis}`
    );
  }

  return { config, messages };
}
