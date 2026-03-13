export const OUTPUT_FORMAT = {
  JSON: 'json',
  TEXT: 'text'
} as const;

export type OutputFormat = typeof OUTPUT_FORMAT[keyof typeof OUTPUT_FORMAT];
