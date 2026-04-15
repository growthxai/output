import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

export const bootstrapProxy = (): void => {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;

  if ( !proxyUrl ) {
    return;
  }

  setGlobalDispatcher( new EnvHttpProxyAgent() );
};
