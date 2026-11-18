import React from 'react';
import { Text } from 'ink';

export const InlineSnippet: React.FC<{ content: string }> = ( { content } ) => (
  <Text color="magenta" italic>{content}</Text>
);
