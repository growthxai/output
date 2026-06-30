import { ValidationError } from '#errors';
import { URL } from 'node:url';

// Possible well known proxy fields
export const proxyEnvVars = [ 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy' ];

export const getProxyUrl = () => {
  for ( const key of proxyEnvVars ) {
    const value = process.env[key];
    if ( typeof value === 'string' && value.length > 0 ) {
      try {
        return new URL( value ).href;
      } catch ( error ) {
        throw new ValidationError( `Invalid Proxy URL "${value}" at process.env.${key}`, { error } );
      }
    }
  }
  return null;
};
