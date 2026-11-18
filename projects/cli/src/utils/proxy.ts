/**
 * Routes all `fetch()` calls through an HTTP/HTTPS proxy when standard
 * proxy env vars are set (`HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`,
 * `http_proxy`). No-op when none are set. Invalid URLs are logged and
 * skipped so the CLI keeps running.
 *
 * Call once at CLI startup, before any network activity. `undici` is
 * imported lazily so invocations without a proxy skip loading it.
 */
export const bootstrapProxy = async (): Promise<void> => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;

  if ( !proxyUrl ) {
    return;
  }

  try {
    new URL( proxyUrl );
  } catch {
    console.warn( `[proxy] Ignoring invalid proxy URL: ${proxyUrl}` );
    return;
  }

  const { EnvHttpProxyAgent, setGlobalDispatcher } = await import( 'undici' );
  setGlobalDispatcher( new EnvHttpProxyAgent() );
};
