import { createChildLogger } from '#logger';
import { detectEnvironment, resolveCredentialRefs } from './credentials.js';
import { checkEnvironmentKey } from './encrypted_yaml_provider.js';

const log = createChildLogger( 'Credentials' );

export const init = () => {
  checkEnvironmentKey( detectEnvironment() );
  const vars = resolveCredentialRefs();
  log.info( 'Resolved credential env vars', { vars } );
};
