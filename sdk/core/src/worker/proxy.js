import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Proxy' );

/**
 * Routes all `fetch()` calls (including those inside Temporal activities)
 * through an HTTP/HTTPS proxy when standard proxy env vars are set
 * (`HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`, `http_proxy`). No-op when
 * none are set. Invalid URLs are logged and skipped so the worker keeps
 * running.
 *
 * Call once at worker startup, before any network activity.
 */
export const bootstrapFetchProxy = () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;

  if ( !proxyUrl ) {
    return;
  }

  try {
    new URL( proxyUrl );
  } catch {
    log.warn( 'Ignoring invalid proxy URL', { proxyUrl } );
    return;
  }

  log.info( 'Routing fetch() through HTTP proxy', { proxyUrl } );
  setGlobalDispatcher( new EnvHttpProxyAgent() );
};
