import { createChildLogger } from '#logger';
import { detectEnvironment, resolveCredentialRefs } from './credentials.js';
import { checkEnvironmentKey, encryptedYamlProvider } from './encrypted_yaml_provider.js';
import { getProvider } from './provider_registry.js';

const log = createChildLogger( 'Credentials' );

export const init = () => {
  if ( getProvider() === encryptedYamlProvider ) {
    checkEnvironmentKey( detectEnvironment() );
  }
  const vars = resolveCredentialRefs();
  log.info( 'Resolved credential env vars', { vars } );
};
