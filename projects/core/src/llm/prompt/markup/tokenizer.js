const tokenizer = /<!--[\s\S]*?-->|<\/\s*[A-Za-z][\w-]*\s*>|<[A-Za-z][\w-]*(?:"[^"]*"|'[^']*'|[^'"<>])*>|<[A-Za-z][\w-]*[^<>]*>|[^<]+|</g;

export const tokenize = value => value.match( tokenizer );
