import { ValidationError } from '@outputai/core';

const envVar = 'GCP_CREDENTIALS_JSON';

const unescapeLinebreaks = v => v.replaceAll( '\\n', '\n' );

const decodeBase64 = v => Buffer.from( v, 'base64' ).toString( 'utf8' );

const parseJson = v => {
  try {
    return JSON.parse( v );
  } catch ( cause ) {
    throw new ValidationError( `Invalid ${envVar}: value is neither JSON nor base64 encoded JSON`, { cause } );
  }
};

export const resolveGoogleVertexAuthOptions = () => {
  const value = process.env[envVar]?.trim();

  if ( !value ) {
    return {};
  }

  const credentials = parseJson( value.startsWith( '{' ) ? value : decodeBase64( value ) );

  if ( credentials.private_key ) {
    credentials.private_key = unescapeLinebreaks( credentials.private_key );
  }

  return { googleAuthOptions: { credentials } };
};
