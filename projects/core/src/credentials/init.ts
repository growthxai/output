import { createChildLogger } from '#logger';
import { loadGlobalCredentials, resolveCredentialRefs } from './credentials.js';
import { encryptedYamlProvider } from './encrypted_yaml_provider.js';
import { getProvider } from './provider_registry.js';

const log = createChildLogger( 'Credentials' );

export const init = () => {
  if ( getProvider() === encryptedYamlProvider ) {
    loadGlobalCredentials();
  }
  const vars = resolveCredentialRefs();
  log.info( 'Resolved credential env vars', { vars } );
};
