import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { createChildLogger } from '#logger';
import { getProxyUrl } from '#helpers/proxy';

const log = createChildLogger( 'Proxy' );

/**
 * Routes all `fetch()` calls (including those inside Temporal activities)
 * through an HTTP/HTTPS proxy when standard proxy env vars are set.
 * No-op when none are set.
 */
export const bootstrapFetchProxy = () => {
  const url = getProxyUrl();
  if ( url ) {
    log.info( 'Routing fetch() through HTTP proxy', { url } );
    /** Ignore HTTP/2. Check OUT-505 */
    setGlobalDispatcher( new EnvHttpProxyAgent( { allowH2: false } ) );
  }
};
