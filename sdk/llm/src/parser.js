import matter from 'gray-matter';
import { FatalError } from '@outputai/core';

const VALID_ROLES = [ 'system', 'user', 'assistant', 'tool' ];

// Matches a message block: <role ...optional-attrs>body</role>
// Group 1: role, Group 2: attribute string (possibly empty), Group 3: body
const MESSAGE_BLOCK_RE = new RegExp(
  `<(${VALID_ROLES.join( '|' )})((?:\\s+[^>]*)?)>([\\s\\S]*?)</\\1>`,
  'gm'
);

// Captures inline cache markers and their attribute string in a single regex.
// Used with String.prototype.split so we can avoid `let` for iteration.
const CACHE_MARKER_SPLIT_RE = /<cache((?:\s+[^/>]*)?)\s*\/>/;
const CACHE_MARKER_GLOBAL_RE = /<cache(?:\s+[^/>]*)?\s*\/>/;

// Parses an attribute string like `cache ttl="1h"` or `cache="5m"`.
// Returns a record of { name: value } where bare attributes have value === true.
function parseTagAttributes( raw ) {
  if ( !raw ) {
    return {};
  }
  const re = /([a-zA-Z_][a-zA-Z0-9_-]*)(?:\s*=\s*"([^"]*)")?/g;
  return Array.from( raw.matchAll( re ) ).reduce( ( attrs, [ , name, value ] ) => {
    attrs[name] = value === undefined ? true : value;
    return attrs;
  }, {} );
}

// Builds Anthropic cache_control from a tag-attribute set on a role opener
// (e.g. `<system cache>` or `<user cache="1h">`). Returns null when caching is
// not requested.
function cacheControlFromTagAttrs( attrs ) {
  if ( !( 'cache' in attrs ) ) {
    return null;
  }
  const ttlFromCacheAttr = typeof attrs.cache === 'string' ? attrs.cache : undefined;
  const ttl = ttlFromCacheAttr ?? ( typeof attrs.ttl === 'string' ? attrs.ttl : undefined );
  return ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
}

// Builds Anthropic cache_control from a `<cache />` marker's attribute set.
// The marker itself implies caching; only TTL is optional.
function cacheControlFromMarkerAttrs( attrs ) {
  const ttl = typeof attrs.ttl === 'string' ? attrs.ttl : undefined;
  return ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
}

function cacheProviderOptions( cacheControl ) {
  return { anthropic: { cacheControl } };
}

// Splits a body at each `<cache />` marker into alternating text fragments and
// marker descriptors. With one capture group, String.prototype.split yields
// [text, attrs, text, attrs, ..., text].
function splitBodyOnCacheMarkers( body ) {
  const fragments = body.split( new RegExp( CACHE_MARKER_SPLIT_RE.source, 'g' ) );
  return fragments.map( ( fragment, idx ) => {
    if ( idx % 2 === 0 ) {
      return { kind: 'text', text: fragment };
    }
    return { kind: 'marker', cacheControl: cacheControlFromMarkerAttrs( parseTagAttributes( fragment ) ) };
  } );
}

// Drops parts with empty text after trimming. If a dropped part carried
// cache directives, hoists them onto the previous part so intent is preserved.
function compactTextParts( parts ) {
  return parts.reduce( ( compact, part ) => {
    if ( part.text.trim() === '' ) {
      if ( part.providerOptions && compact.length > 0 ) {
        compact[compact.length - 1].providerOptions = part.providerOptions;
      }
      return compact;
    }
    compact.push( { ...part, text: part.text.trim() } );
    return compact;
  }, [] );
}

// Builds structured content parts from a body containing cache markers.
function buildContentParts( body ) {
  const fragments = splitBodyOnCacheMarkers( body );
  const rawParts = fragments.reduce( ( acc, fragment, idx ) => {
    if ( fragment.kind === 'marker' ) {
      return acc;
    }
    const next = fragments[idx + 1];
    const cacheControl = next?.kind === 'marker' ? next.cacheControl : null;
    const part = { type: 'text', text: fragment.text };
    if ( cacheControl ) {
      part.providerOptions = cacheProviderOptions( cacheControl );
    }
    acc.push( part );
    return acc;
  }, [] );
  return compactTextParts( rawParts );
}

// Builds a message object from a parsed block. Returns flat-string `content`
// when no caching directives are present (back-compat); otherwise returns
// structured content parts and an optional message-level `providerOptions`.
function buildMessage( role, attrString, body ) {
  const tagCacheControl = cacheControlFromTagAttrs( parseTagAttributes( attrString ) );
  const hasInlineMarker = CACHE_MARKER_GLOBAL_RE.test( body );

  if ( !tagCacheControl && !hasInlineMarker ) {
    return { role, content: body.trim() };
  }

  if ( tagCacheControl && !hasInlineMarker ) {
    return {
      role,
      content: body.trim(),
      providerOptions: cacheProviderOptions( tagCacheControl )
    };
  }

  const parts = buildContentParts( body );
  if ( parts.length === 0 ) {
    throw new FatalError( `<${role}> block contains only cache markers with no text content` );
  }

  const message = { role, content: parts };
  if ( tagCacheControl ) {
    message.providerOptions = cacheProviderOptions( tagCacheControl );
  }
  return message;
}

export function parsePrompt( raw ) {
  const { data: config, content } = matter( raw );

  if ( !content || content.trim() === '' ) {
    throw new FatalError( 'Prompt file has no content after frontmatter' );
  }

  const messages = [ ...content.matchAll( new RegExp( MESSAGE_BLOCK_RE.source, 'gm' ) ) ].map(
    ( [ , role, attrString, body ] ) => buildMessage( role, attrString, body )
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
