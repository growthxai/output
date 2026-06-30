import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Proxy' );

/**
 * Routes all `fetch()` calls (including those inside Temporal activities)
 * through an HTTP/HTTPS proxy when standard proxy env vars are set.
 * No-op when none are set.
 */
export const bootstrapFetchProxy = () => {
  const httpProxyUrl = process.env.http_proxy ?? process.env.HTTP_PROXY;
  const httpsProxyUrl = process.env.https_proxy ?? process.env.HTTPS_PROXY;

  if ( httpProxyUrl?.length > 0 || httpsProxyUrl?.length > 0 ) {
    log.info( 'Proxy env vars detected, setting up global fetch dispatcher EnvHttpProxyAgent', { httpProxyUrl, httpsProxyUrl } );
    /** Ignore HTTP/2. Check OUT-505 */
    setGlobalDispatcher( new EnvHttpProxyAgent( { allowH2: false } ) );
  }
};
