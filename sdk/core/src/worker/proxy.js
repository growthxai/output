import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { createChildLogger } from '#logger';

const log = createChildLogger( 'Proxy' );

export const bootstrapFetchProxy = () => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;

  if ( !proxyUrl ) {
    return;
  }

  log.info( 'Routing fetch() through HTTP proxy', { proxyUrl } );
  setGlobalDispatcher( new EnvHttpProxyAgent() );
};
